// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "ReactDomNativeKit",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "ReactDomNativeKit", targets: ["ReactDomNativeKit"]),
        .library(name: "ShadowTree", targets: ["ShadowTree"]),
        .library(name: "JSEngine", targets: ["JSEngine"]),
        .library(name: "Yoga", targets: ["Yoga"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "Yoga",
            path: "Sources/Yoga",
            publicHeadersPath: "include",
            cxxSettings: [
                .headerSearchPath("."),
            ]
        ),
        .target(
            name: "ShadowTree",
            dependencies: ["Yoga"],
            path: "Sources/ShadowTree"
        ),
        .target(
            name: "JSEngine",
            dependencies: [],
            path: "Sources/JSEngine"
        ),
        .target(
            name: "ReactDomNativeKit",
            dependencies: ["ShadowTree", "JSEngine", "Yoga"],
            path: "Sources/ReactDomNativeKit",
            resources: [.copy("Resources/bundle.js")]
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNativeKit"],
            path: "Tests/ReactDomNativeTests"
        )
    ],
    swiftLanguageModes: [.v5],
    cxxLanguageStandard: .cxx20
)
