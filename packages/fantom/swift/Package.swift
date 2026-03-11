// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "FantomTester",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .executable(name: "FantomTester", targets: ["FantomTester"])
    ],
    dependencies: [
        .package(path: "../../../packages/react-dom-native/ios")
    ],
    targets: [
        .executableTarget(
            name: "FantomTester",
            dependencies: [
                .product(name: "ShadowTree", package: "ios"),
                .product(name: "JSEngine", package: "ios"),
            ],
            path: "Sources/FantomTester"
        )
    ],
    swiftLanguageModes: [.v5]
)
