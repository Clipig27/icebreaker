#!/bin/bash

echo "📱 Opening two simulators with Expo Go..."

# Boot 2 simulators
xcrun simctl boot "iPhone 16 Pro" 2>/dev/null
xcrun simctl boot "iPhone 16 Pro Max" 2>/dev/null

# Open Simulator app
open -a Simulator

# Give them a second to boot
sleep 2

# Open Expo Go on both
xcrun simctl launch "iPhone 16 Pro" host.exp.Exponent 2>/dev/null
xcrun simctl launch "iPhone 16 Pro Max" host.exp.Exponent 2>/dev/null

echo "✅ Done"