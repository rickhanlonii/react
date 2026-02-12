// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FantomTester",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .executable(name: "FantomTester", targets: ["FantomTester"])
    ],
    dependencies: [
        .package(path: "../../packages/react-dom-native/ios")
    ],
    targets: [
        .executableTarget(
            name: "FantomTester",
            dependencies: [
                .product(name: "ShadowTree", package: "ReactDomNativeKit")
            ],
            path: "Sources/FantomTester"
        )
    ]
)
