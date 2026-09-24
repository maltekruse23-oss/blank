//! Whether the mouse is on blank.'s own taskbar button. In pet mode this tells a click on that
//! button apart from other reasons Windows activates the window (e.g. the focus returning to it
//! after the Start menu or a taskbar flyout closes). Read-only, via UI Automation.
use windows::Win32::{
    Foundation::HWND,
    System::{
        Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_MULTITHREADED,
        },
        Variant::VARIANT,
    },
    UI::Accessibility::{
        CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_ClassNamePropertyId,
    },
};
use windows_sys::Win32::{
    Foundation::POINT,
    UI::WindowsAndMessaging::{GetAncestor, GetClassNameW, GetCursorPos, WindowFromPoint, GA_ROOT},
};

/// The taskbar (on any monitor) under the mouse and the mouse position in physical pixels. Cheap;
/// safe to call inside a window message.
pub fn under_cursor() -> Option<(isize, (i32, i32))> {
    let mut point = POINT { x: 0, y: 0 };
    let mut class = [0u16; 32];
    // SAFETY: plain queries; the point and the class buffer are valid for the given lengths.
    let (root, length) = unsafe {
        if GetCursorPos(&mut point) == 0 {
            return None;
        }
        let window = WindowFromPoint(point);
        if window.is_null() {
            return None;
        }
        let root = GetAncestor(window, GA_ROOT);
        (
            root,
            GetClassNameW(root, class.as_mut_ptr(), class.len() as i32),
        )
    };
    let class = String::from_utf16_lossy(&class[..length.max(0) as usize]);
    matches!(class.as_str(), "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
        .then_some((root as isize, (point.x, point.y)))
}

/// Whether `point` lies on blank.'s button on that taskbar. Asks explorer, so it must run on its
/// own thread and never inside a window message of the app.
pub fn on_own_button(taskbar: isize, (x, y): (i32, i32)) -> bool {
    let exe = std::env::current_exe()
        .map(|path| path.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    // SAFETY: COM is initialized for this thread for the duration of the query; every interface
    // is released inside `find` before CoUninitialize.
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let find = || -> windows::core::Result<bool> {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            let root = automation.ElementFromHandle(HWND(taskbar as _))?;
            let condition = automation.CreatePropertyCondition(
                UIA_ClassNamePropertyId,
                &VARIANT::from("Taskbar.TaskListButtonAutomationPeer"),
            )?;
            let buttons = root.FindAll(TreeScope_Descendants, &condition)?;
            for index in 0..buttons.Length()? {
                let button = buttons.GetElement(index)?;
                let rect = button.CurrentBoundingRectangle()?;
                if x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom {
                    continue;
                }
                // "Appid: <path of the exe>" while blank. has no pinned app ID of its own.
                let id = button.CurrentAutomationId()?.to_string().to_lowercase();
                let name = button.CurrentName()?.to_string();
                return Ok(
                    id.strip_prefix("appid: ") == Some(exe.as_str()) || name.starts_with("blank.")
                );
            }
            Ok(false)
        };
        let found = find().unwrap_or(false);
        if initialized {
            CoUninitialize();
        }
        found
    }
}
