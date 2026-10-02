"""OpenCharm v0.1 printable shell for the Waveshare ESP32-S3-Touch-AMOLED-2.16.

Dimensions come from Waveshare's official 2D drawing (2026-02-09), copied in
hardware/reference/waveshare-esp32-s3-touch-amoled-2.16/.

Run:  pip install -r requirements.txt && python3 gen.py
Out:  ../stl/print/*.stl  (oriented for printing)
      ../stl/view/*.stl   (assembly coordinates, embedded in PROTOTYPE.html
                           by npm run prototype:build)

Coordinates: mm. x right, y up (as you look at the face), z = 0 at the front face,
+z goes backwards into the device. The front shell prints face-down (z = 0 on the bed).
"""

import json
import math
import os

import numpy as np
import trimesh
from manifold3d import CrossSection, JoinType, Manifold

SEG = 64
# ---- from the Waveshare drawing ----
GLASS = 43.30  # display glass (DD) 43.30 ± 0.05, corners R4.70
GLASS_R = 4.70
VA = 38.99  # active area
BTN_Z = 9.60  # side buttons: centre 9.6 mm behind the front, 10 mm pitch, Ø5.3 in their case
BTN_PITCH = 10.0
USB_Z = 8.62  # USB-C centre depth on the left side
MIC_Z = (
    8.30  # mic pinhole depth: a guess (8.30 is the microSD slot on the drawing); check on the board
)
# ---- our choices ----
CL = 0.15  # clearance per side around the glass
WALL = 1.60  # 4 perimeters at 0.4 mm
POCKET = GLASS + 2 * CL
POCKET_R = GLASS_R + CL
W = POCKET + 2 * WALL  # outer: 46.8 mm
R = POCKET_R + WALL  # outer corner: concentric with the glass corner
LIP = 0.60  # front lip thickness (3 layers at 0.2)
WIN = GLASS - 1.60  # window: covers 0.8 mm of the glass's 2.15 mm black border
D = 22.0  # total depth (Waveshare's own case: 22.5)
T = 18.0  # front shell depth
PLUG = 2.2  # back cover plug that slides into the shell
FIT = 0.10  # plug clearance per side
FILLET = 2.4  # back edge roundover
FRONT_CH = 0.6  # front edge chamfer (prints face-down without supports)


def rr(s, r, seg=SEG):
    r = min(r, s / 2 - 0.01)
    return CrossSection.square((s - 2 * r, s - 2 * r), center=True).offset(
        r, JoinType.Round, 2.0, seg
    )


def slab(s, r, z, h=0.01):
    return Manifold.extrude(rr(s, r), h).translate((0, 0, z))


def cyl_x(r, length, y, z, x0):
    return Manifold.cylinder(length, r, r, 48).rotate((0, 90, 0)).translate((x0, y, z))


def cyl_y(r, length, x, z, y0):
    return Manifold.cylinder(length, r, r, 48).rotate((-90, 0, 0)).translate((x, y0, z))


def front_shell():
    # body: tiny chamfer at the front, straight walls, open back
    body = Manifold.batch_hull(
        [
            slab(W - 2 * FRONT_CH, R - FRONT_CH, 0),
            slab(W, R, FRONT_CH),
            slab(W, R, T - 0.01),
        ]
    )
    cavity = Manifold.extrude(rr(POCKET, POCKET_R), T).translate((0, 0, LIP))
    # window with a 45° bevel so the lip reads as a deliberate frame
    window = Manifold.batch_hull(
        [slab(WIN + 2 * LIP, GLASS_R - 0.8 + LIP, -0.01), slab(WIN, GLASS_R - 0.8, LIP)]
    )
    s = body - cavity - window

    x_out = W / 2
    # RIGHT side: one real key (middle button) + two pinholes for PWR / BOOT
    s -= cyl_x(2.80, 4, 0, BTN_Z, x_out - 2.5)  # key hole Ø5.6
    for y in (BTN_PITCH, -BTN_PITCH):
        s -= cyl_x(0.80, 4, y, BTN_Z, x_out - 2.5)  # pinholes Ø1.6
    # LEFT side: USB-C plug opening 11.2 x 5.8, rounded
    usb = Manifold.batch_hull(
        [cyl_x(2.9, 4, 2.7, USB_Z, -x_out - 1.5), cyl_x(2.9, 4, -2.7, USB_Z, -x_out - 1.5)]
    )
    s -= usb
    # TOP: mic pinhole, and the strap notch at the seam (top centre, back edge)
    s -= cyl_y(0.6, 4, 10.0, MIC_Z, W / 2 - 2.5)
    s -= Manifold.cube((2.6, 4, 2.2)).translate((-1.3, W / 2 - 2.5, T - 2.2))
    # BOTTOM: speaker slots between two desk rails, second mic pinhole
    for i in range(5):
        x = (i - 2) * 2.2
        slot = Manifold.batch_hull(
            [cyl_y(0.55, 4, x, 11.5, -W / 2 - 1.5), cyl_y(0.55, 4, x, 15.5, -W / 2 - 1.5)]
        )
        s -= slot
    # desk rails: raise it 0.6 mm so the speaker can breathe when it stands
    for x in (-13.0, 13.0):
        rail = Manifold.batch_hull(
            [cyl_z_pill(x, -W / 2 + 0.3, 3.5), cyl_z_pill(x, -W / 2 + 0.3, T - 1.0)]
        )
        s += rail
    # second mic pinhole (position is a guess), cut after the rails so they can't block it
    s -= cyl_y(0.6, 4, 8.0, 6.0, -W / 2 - 1.5)
    return s


def cyl_z_pill(x, y, z):
    return Manifold.sphere(0.9, 24).scale((3.2, 1.0, 1.0)).translate((x, y, z))


def back_cover():
    # outer plate z = T .. D with a rounded back edge
    parts = [slab(W, R, T)]
    n = 8
    for k in range(n + 1):
        th = k / n * math.pi / 2
        z = D - FILLET + FILLET * math.sin(th)
        inset = FILLET * (1 - math.cos(th))
        parts.append(slab(W - 2 * inset, R - inset, min(z, D - 0.01)))
    plate = Manifold.batch_hull(parts)
    # plug that slides into the shell (friction fit), with a gap where the strap cord runs
    ps = POCKET - 2 * FIT
    plug = Manifold.extrude(rr(ps, POCKET_R - FIT), PLUG) - Manifold.extrude(
        rr(ps - 3.2, POCKET_R - FIT - 1.6), PLUG
    ).translate((0, 0, -0.01))
    plug = plug.translate((0, 0, T - PLUG))
    plug -= Manifold.cube((3.0, 4, PLUG + 0.2)).translate((-1.5, ps / 2 - 2.5, T - PLUG - 0.1))
    c = plate + plug
    # strap bar: a Ø1.8 pin across a small pocket just inside the top edge
    yb = ps / 2 - 3.6
    # pocket 3.0 mm deep: leaves 1.2 mm above the pin for the cord to loop round
    c -= Manifold.cube((6.0, 5.0, 3.0)).translate((-3.0, yb - 2.5, T - 0.01))
    c += cyl_x(0.9, 6.4, yb, T + 0.9, -3.2)
    # a shallow name plate on the back: 0.4 mm recess you can paint or sticker
    c -= Manifold.extrude(rr(22, 3), 0.4).translate((0, -4, D - 0.4))
    return c


def key_cap():
    # flat face with a 0.4 mm chamfer so it prints face-down cleanly
    head = Manifold.batch_hull(
        [
            Manifold.cylinder(0.01, 2.25, 2.25, 48),
            Manifold.cylinder(2.0, 2.65, 2.65, 48).translate((0, 0, 0.4)),
        ]
    )
    flange = Manifold.cylinder(0.8, 3.7, 3.7, 48).translate(
        (0, 0, 2.4)
    )  # keeps it captive inside the wall
    stem = Manifold.cylinder(1.2, 1.2, 1.2, 32).translate(
        (0, 0, 3.2)
    )  # presses the board's switch; trim to fit
    return head + flange + stem


def save(m, path, flip_z_for_print=False):
    mesh = m.to_mesh()
    v = np.array(mesh.vert_properties)[:, :3]
    f = np.array(mesh.tri_verts)
    t = trimesh.Trimesh(v, f, process=True)
    if flip_z_for_print:
        t.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [1, 0, 0]))
        t.apply_translation([0, 0, -t.bounds[0][2]])
    t.export(path)
    return t


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out_print = os.path.join(here, "..", "stl", "print")
    out_view = os.path.join(here, "..", "stl", "view")
    os.makedirs(out_print, exist_ok=True)
    os.makedirs(out_view, exist_ok=True)
    fs, bc, kc = front_shell(), back_cover(), key_cap()
    info = {}
    # view files: assembly coordinates (used by PROTOTYPE.html)
    for name, m in (("front", fs), ("back", bc), ("key", kc)):
        t = save(m, os.path.join(out_view, "view_" + name + ".stl"))
        info[name] = {
            "tris": len(t.faces),
            "watertight": bool(t.is_watertight),
            "bounds": np.round(t.bounds, 2).tolist(),
            "volume_cm3": round(t.volume / 1000, 2),
        }
    # print files: front face-down, back cover outer face down, key face down
    save(fs, os.path.join(out_print, "opencharm_front_shell.stl"))
    save(bc, os.path.join(out_print, "opencharm_back_cover.stl"), flip_z_for_print=True)
    save(kc, os.path.join(out_print, "opencharm_key.stl"))
    info["dims"] = {
        "W": round(W, 2),
        "R": round(R, 2),
        "D": D,
        "pocket": round(POCKET, 2),
        "window": round(WIN, 2),
    }
    print(json.dumps(info, indent=1))
