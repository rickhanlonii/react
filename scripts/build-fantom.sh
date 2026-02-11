#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../ios"

echo "Building FantomTester for macOS..."
swift build -c release --product FantomTester --disable-sandbox

echo "FantomTester built at: ios/.build/release/FantomTester"
