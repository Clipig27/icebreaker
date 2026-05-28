#!/bin/bash
# Boot 5 iPhone simulators and open Expo Go on each for multiplayer testing

SIMS=(
  "5B44CA0A-3D81-4408-8530-0741F1C493D5"  # iPhone 16 Pro
  "1D333E76-8F6A-4E25-A4AF-314A79135616"  # iPhone 16 Pro Max
  "15FD5200-243C-4BDA-9D2B-462BF859CF98"  # iPhone 16e
  "1AD18C61-CED1-46A1-96C4-1660EB27ADCC"  # iPhone 16
  "C00B6530-4EEF-403A-BB3C-DA5EADBB3244"  # iPhone 16 Plus
)

echo "Booting 5 simulators..."
for id in "${SIMS[@]}"; do
  xcrun simctl boot "$id" 2>/dev/null
done

# Open all in Simulator app
open -a Simulator

echo "Waiting for simulators to finish booting..."
sleep 8

echo "Opening Expo Go on each simulator..."
for id in "${SIMS[@]}"; do
  xcrun simctl openurl "$id" "exp://$(ipconfig getifaddr en0):8081" 2>/dev/null &
done

echo "Done! All 5 simulators should be loading the app."
