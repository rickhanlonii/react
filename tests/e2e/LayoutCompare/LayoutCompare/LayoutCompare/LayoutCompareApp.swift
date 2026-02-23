import SwiftUI
import UIKit

@main
struct LayoutCompareApp: App {
    init() {
        HTTPResultsServer.shared.start()
        UIScrollView.appearance().bounces = false
    }

    var body: some Scene {
        WindowGroup {
            NavigationView {
                FixtureListView()
            }
            .navigationViewStyle(.stack)
        }
    }
}
