// The charm's colour (spec 014): the six identity swatches, one of your own from the system picker,
// or one typed as #RRGGBB. Shared by Settings and the setup; the page saves it, charmd judges it.
const COLORS = window.CharmFace.COLORS;
const OWN_COLOUR = /^#[0-9A-F]{6}$/i;

// The face engine's colour for an id or a #RRGGBB: a colour of your own lights a white charm's glyphs.
export function colourOf(id) {
  if (OWN_COLOUR.test(id)) return { ...COLORS[0], id, g: id.toUpperCase() };
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

// Fills `root` with the picker. onPick(id) saves (it may return a promise), onPreview(colour) shows
// a colour while the system picker moves, onError(text) says why a typed one can't be used.
// `labelledBy` names the element that labels the swatches. Returns { set(id) } to show the saved one.
export function mountColourPicker(
  root,
  { labelledBy, onPick, onPreview, onError }
) {
  root.classList.add("colour-picker");
  root.innerHTML = `
    <div class="colour-row">
      <div class="swatches" role="radiogroup" aria-labelledby="${labelledBy}"></div>
      <input type="color" class="swatch own" title="A colour of your own" aria-label="A colour of your own" />
    </div>
    <div class="row">
      <input class="own-hex" maxlength="7" spellcheck="false" placeholder="#RRGGBB" aria-label="A colour of your own, as #RRGGBB" />
    </div>
    <p class="note">
      Or your own colour, picked or typed: anything but orange, which only means "it needs you",
      and bright enough to see on black.
    </p>`;
  const swatches = root.querySelector(".swatches");
  const own = root.querySelector(".own");
  const hex = root.querySelector(".own-hex");
  let current = COLORS[0].id;
  const pick = (id) => Promise.resolve(onPick(id));

  for (const colour of COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = colour.id === "white" ? "swatch light" : "swatch";
    swatch.dataset.id = colour.id;
    swatch.style.setProperty("--c", colour.c);
    swatch.setAttribute("role", "radio");
    swatch.setAttribute("aria-label", colour.name);
    swatch.title = colour.name;
    swatch.addEventListener("click", () => void pick(colour.id));
    swatches.append(swatch);
  }
  // Arrow keys move between the swatches, like any radio group; from your own colour they start at
  // either end of the six.
  swatches.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const at = COLORS.findIndex((c) => c.id === current);
    const next =
      at < 0
        ? COLORS.at(step > 0 ? 0 : -1)
        : COLORS[(at + step + COLORS.length) % COLORS.length];
    void pick(next.id).then(() =>
      swatches.querySelector(`[data-id="${next.id}"]`)?.focus()
    );
  });

  // The system picker shows the colour as it moves; macOS's colour panel may report every move as
  // a change, so it saves once it rests.
  let resting;
  own.addEventListener("input", () =>
    onPreview(colourOf(own.value.toUpperCase()))
  );
  own.addEventListener("change", () => {
    clearTimeout(resting);
    const colour = own.value.toUpperCase();
    resting = setTimeout(() => void pick(colour), 400);
  });
  hex.addEventListener("change", () => {
    const typed = hex.value.trim().toUpperCase();
    if (!typed) return;
    const colour = typed.startsWith("#") ? typed : `#${typed}`;
    if (!OWN_COLOUR.test(colour)) return onError("Type a colour as #RRGGBB.");
    void pick(colour);
  });

  function set(id) {
    current = id;
    const isOwn = OWN_COLOUR.test(id);
    for (const swatch of swatches.children) {
      const on = swatch.dataset.id === id;
      swatch.setAttribute("aria-checked", String(on));
      swatch.tabIndex =
        on || (isOwn && swatch === swatches.firstChild) ? 0 : -1;
    }
    // The picker opens at the colour the charm wears now, never at one that was refused.
    own.dataset.on = String(isOwn);
    own.value = colourOf(id).g.toLowerCase();
    hex.value = isOwn ? id.toUpperCase() : "";
  }
  set(current);
  return { set };
}
