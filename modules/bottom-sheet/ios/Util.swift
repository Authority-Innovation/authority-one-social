//
//  Util.swift
//  Pods
//
//  Created by Hailey on 10/2/24.
//

class Util {
  static func getScreenHeight() -> CGFloat? {
    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
     let window = windowScene.windows.first {
      let safeAreaInsets = window.safeAreaInsets
      // The window, not UIScreen.main: on an iPhone Duo unfolded (or an iPad running the
      // iPhone app in a window) the app is not on the main screen or not full-screen.
      let fullScreenHeight = window.bounds.height
      return fullScreenHeight - (safeAreaInsets.top + safeAreaInsets.bottom)
    }
    return nil
  }
}
