import SwiftUI

@main
struct LayoutCompareApp: App {
    init() {
        HTTPResultsServer.shared.start()
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
