//! Where the desktop charm sits and how big it is, in points. Pure, so it's tested without a screen.

use serde::Serialize;

/// Each side of the notch keeps an "ear" this wide for an eye.
pub const EAR: f64 = 64.0;
/// The panel's full height below the notch: questions, pairing and the PIN; words take less.
pub const OPEN_HEIGHT: f64 = 180.0;
/// Without a notch (older Macs, external displays, Windows) the charm draws a black pill this wide
/// and this tall at the top centre, where a notch would be.
pub const PILL_NOTCH: f64 = 120.0;
pub const PILL_STRIP: f64 = 30.0;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Geometry {
    /// The panel's width (the notch plus two ears).
    pub width: f64,
    /// The panel's height when open.
    pub height: f64,
    /// The notch's width (or the pill's).
    pub notch: f64,
    /// The strip's height: the menu bar beside the notch, where the eyes sit.
    pub strip: f64,
    /// The panel's left edge on the screen; its top is the screen's top.
    pub x: f64,
    /// Tests only: a tone instead of the microphone.
    pub fake_mic: bool,
    /// charmd's address when it isn't the default (ws://127.0.0.1:8787/charm).
    pub url: Option<String>,
    /// Automated tests only (OPENCHARM_TEST_PIN): type this PIN, hold the key for one turn, log it.
    pub test_pin: Option<String>,
    /// The app runs this charmd (spec 013): pair and unlock without a code or a PIN.
    pub auto_pair: bool,
}

/// How tall the open panel is: what the charm asks for (words take only what they need), within the
/// strip and the full panel; the full panel when it doesn't say.
pub fn panel_height(geometry: &Geometry, asked: Option<f64>) -> f64 {
    match asked {
        Some(height) if height.is_finite() => height.clamp(geometry.strip, geometry.height),
        _ => geometry.height,
    }
}

/// `notch`: the real notch's width and the menu bar's height beside it, when the screen has one.
pub fn layout(screen_width: f64, notch: Option<(f64, f64)>) -> Geometry {
    let (notch, strip) = notch.unwrap_or((PILL_NOTCH, PILL_STRIP));
    let width = notch + 2.0 * EAR;
    Geometry {
        width,
        height: OPEN_HEIGHT,
        notch,
        strip,
        x: ((screen_width - width) / 2.0).round(),
        fake_mic: false,
        url: None,
        test_pin: None,
        auto_pair: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hugs_a_real_notch_with_an_ear_either_side() {
        let g = layout(1512.0, Some((185.0, 38.0)));
        assert_eq!(g.width, 313.0);
        assert_eq!(g.notch, 185.0);
        assert_eq!(g.strip, 38.0);
        assert_eq!(g.x, 600.0);
    }

    #[test]
    fn draws_a_pill_where_a_notch_would_be_on_screens_without_one() {
        let g = layout(1920.0, None);
        assert_eq!(g.notch, PILL_NOTCH);
        assert_eq!(g.strip, PILL_STRIP);
        assert_eq!(g.x, ((1920.0 - (PILL_NOTCH + 2.0 * EAR)) / 2.0).round());
    }

    #[test]
    fn opens_only_as_far_as_the_charm_asks_within_the_panel() {
        let g = layout(1512.0, Some((185.0, 38.0)));
        assert_eq!(panel_height(&g, Some(108.5)), 108.5);
        assert_eq!(panel_height(&g, Some(10.0)), 38.0);
        assert_eq!(panel_height(&g, Some(900.0)), OPEN_HEIGHT);
        assert_eq!(panel_height(&g, Some(f64::NAN)), OPEN_HEIGHT);
        assert_eq!(panel_height(&g, None), OPEN_HEIGHT);
    }

    #[test]
    fn opens_to_the_same_height_everywhere() {
        assert_eq!(layout(1512.0, Some((185.0, 38.0))).height, OPEN_HEIGHT);
        assert_eq!(layout(1920.0, None).height, OPEN_HEIGHT);
    }
}
