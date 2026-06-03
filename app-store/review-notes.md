# Icebreaker -- App Store Review Notes

## Overview

Icebreaker is a real-time multiplayer party game app. Players create or join game rooms using a short room code, then play interactive games together on their own devices. All gameplay requires 2 or more players connected to the same room.

---

## Account & Authentication

No account creation is required. Players simply launch the app and choose a display username. There are no login credentials, emails, or passwords. No demo account is needed.

---

## Testing Requirements

**This app requires 2 or more players to test.** To properly review the app, you will need to run it on at least two devices or simulators simultaneously.

### Step-by-Step Testing Instructions

#### Setting Up (Device A -- Host)
1. Open Icebreaker on Device A.
2. Enter any username (e.g., "Reviewer1").
3. Tap "Create Room."
4. A 4-character room code will be displayed on screen. Note this code.

#### Joining (Device B -- Player)
1. Open Icebreaker on Device B.
2. Enter a different username (e.g., "Reviewer2").
3. Tap "Join Room."
4. Enter the room code from Device A.
5. Both devices should now show the room lobby with both players listed.

#### Playing a Game
1. On Device A (the host), browse the list of available games in the room lobby.
2. Select any game (we recommend starting with "Lie Detector" or "Number Guessor" as they are the simplest to test with 2 players).
3. Both devices will transition to the game screen.
4. Follow the on-screen prompts on each device to play through the game.
5. After the game ends, results and scores are displayed. Players return to the lobby.

---

## Notes on Specific Games

Some games have specific player count or interaction requirements:

| Game | Min Players | Notes |
|------|-------------|-------|
| Lie Detector | 2 | Each player submits statements; others guess the lie. |
| Talent Show | 3+ | Requires at least one performer and two voters. With 2 players, one performs and one votes. |
| Stand Out | 3+ | Best experienced with 3+ players for duplicate detection. Playable with 2. |
| Number Guessor | 2 | Players guess a number; closest to the answer wins. |
| Pie Charts | 3+ | Voting on group members works best with 3+ players. Playable with 2. |
| Deal or Steal | 2 | Players negotiate and choose to deal or steal. |
| Shadow Protocol | 4+ | Social deduction requires at least 4 players for role assignment. |
| ChainLink | 2 | Word chaining with AI-judged challenges. Requires internet for AI referee. |
| Pot Luck | 2 | Trivia with a growing pot. |
| Plot Twist | 3+ | Collaborative storytelling. Playable with 2, better with 3+. |

**Recommended for 2-player review:** Lie Detector, Number Guessor, Deal or Steal, ChainLink, Pot Luck.

---

## Network Requirements

- The app requires an active internet connection at all times.
- Real-time multiplayer is powered by WebSocket connections to our game server.
- If a player briefly loses connection, the app will attempt to reconnect automatically.

---

## User-Generated Content

- Players type in answers, statements, and story contributions during gameplay. This content is visible only to players in the same room and is not stored after the room closes.
- There is no public feed, social features, or content sharing outside of a game room.
- The age rating of 12+ accounts for the possibility of mild language in user-generated responses.

---

## In-App Purchases

There are no in-app purchases in version 1.0.

---

## Additional Notes

- No push notifications are used in version 1.0.
- The app does not access the camera, microphone, location, contacts, photos, or any other sensitive device features.
- The app does not use any third-party analytics or advertising SDKs.
- All game data is ephemeral -- room data is deleted when the room is closed. No game history is persisted.

---

## Contact

For any questions during the review process, please reach out to: privacy@icebreaker.app
