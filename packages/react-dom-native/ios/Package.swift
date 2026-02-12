// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNativeKit",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "ReactDomNativeKit", targets: ["ReactDomNativeKit"]),
        .library(name: "ShadowTree", targets: ["ShadowTree"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "ShadowTree",
            dependencies: [],
            path: "Sources/ShadowTree"
        ),
        .target(
            name: "ReactDomNativeKit",
            dependencies: ["ShadowTree"],
            path: "Sources/ReactDomNativeKit"
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNativeKit"],
            path: "Tests/ReactDomNativeTests"
        )
    ]
)
