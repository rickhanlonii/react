import SwiftUI

@main
struct LayoutCompareApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationView {
                FixtureListView()
            }
            .navigationViewStyle(.stack)
        }
    }
}
