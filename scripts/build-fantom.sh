#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../tools/fantom/swift"

echo "Building FantomTester for macOS..."
swift build -c release --product FantomTester --disable-sandbox

echo "FantomTester built at: tools/fantom/swift/.build/release/FantomTester"
