//! macOS: measure the notch, and lift the window above the menu bar on every Space.

use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSScreen, NSWindow, NSWindowCollectionBehavior};

/// The main screen's width, and the notch's width and the menu bar's height when it has a notch.
pub fn measure() -> (f64, Option<(f64, f64)>) {
    let Some(mtm) = MainThreadMarker::new() else {
        return (1440.0, None);
    };
    let Some(screen) = NSScreen::mainScreen(mtm) else {
        return (1440.0, None);
    };
    let frame = screen.frame();
    let top = screen.safeAreaInsets().top;
    if top <= 0.0 {
        return (frame.size.width, None);
    }
    let left = screen.auxiliaryTopLeftArea();
    let right = screen.auxiliaryTopRightArea();
    let notch = frame.size.width - left.size.width - right.size.width;
    (frame.size.width, Some((notch, top)))
}

/// To the very front, above every app, without taking the keyboard from the app you're in.
pub fn bring_to_front(ns_window: *mut std::ffi::c_void) {
    // SAFETY: Tauri hands us its live NSWindow pointer on the main thread.
    let window: &NSWindow = unsafe { &*(ns_window as *const NSWindow) };
    window.orderFrontRegardless();
}

/// Typing is done: the app you were in gets the keyboard back (OpenCharm has no window to switch to).
pub fn give_back_keyboard() {
    if let Some(mtm) = MainThreadMarker::new() {
        NSApplication::sharedApplication(mtm).deactivate();
    }
}

/// Above the menu bar (the status window level), on every Space and over full-screen apps, and never
/// in the window cycle: it's a part of the screen, not a window you switch to.
pub fn float_over_menu_bar(ns_window: *mut std::ffi::c_void) {
    // SAFETY: Tauri hands us its live NSWindow pointer on the main thread.
    let window: &NSWindow = unsafe { &*(ns_window as *const NSWindow) };
    window.setLevel(25);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    window.setHasShadow(false);
}
