// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNative",
    platforms: [.iOS(.v15)],
    products: [
        .executable(name: "ReactDomNative", targets: ["ReactDomNative"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "ReactDomNative",
            dependencies: [],
            path: "Sources/ReactDomNative",
            resources: [.copy("Resources")]
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNative"],
            path: "Tests/ReactDomNativeTests"
        )
    ]
)
