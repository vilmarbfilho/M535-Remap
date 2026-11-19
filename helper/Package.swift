// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "M535Helper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "M535Helper",
            path: "Sources/M535Helper",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("IOKit"),
                .linkedFramework("ServiceManagement"),
            ]
        )
    ]
)
