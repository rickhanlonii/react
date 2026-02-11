// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNative",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .executable(name: "ReactDomNative", targets: ["ReactDomNative"]),
        .library(name: "ShadowTree", targets: ["ShadowTree"]),
        .executable(name: "FantomTester", targets: ["FantomTester"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "ShadowTree",
            dependencies: [],
            path: "Sources/ShadowTree"
        ),
        .executableTarget(
            name: "ReactDomNative",
            dependencies: ["ShadowTree"],
            path: "Sources/ReactDomNative",
            resources: [.copy("Resources")]
        ),
        .executableTarget(
            name: "FantomTester",
            dependencies: ["ShadowTree"],
            path: "Sources/FantomTester"
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNative"],
            path: "Tests/ReactDomNativeTests"
        )
    ]
)
