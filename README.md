# Icebreaker
 
**Social minigames with friends.** 10 real-time multiplayer party games for friend groups of any size. Create a room, share the code, and play, whether you're hanging out, on a call, or at a party.
 
No sign-ups. No ads. No friction. Pick a username and start playing in seconds.

 
## The Games
 
| Game | What it is |
|---|---|
| **Trust Me Bro** | Spot the lie in each player's statements. Read the room and call out bluffs. |
| **Silly Spotlight** | Perform challenges, audience votes across 3 rounds. Fame or flame-out. |
| **Copycat** | Answer prompts simultaneously. Unique answers score. Matching answers lose points. |
| **Number Guessor** | Estimation battles. Closest guess to the real number wins. No trivia knowledge needed. |
| **Pie Charts** | Vote on "who's most likely to..." questions, results revealed as pie charts. |
| **Deal or Steal** | Secret deals, negotiation, and betrayal. Trust is a currency and it runs out. |
| **Shadow Protocol** | Social deduction. Agents run missions while shadows sabotage from within. |
| **Smarty Pot** | Trivia with a growing shared prize pot. Push your luck or play it safe. |
| **Link or Sink** | Build a word chain one player at a time. Challenges are resolved by an AI referee. |
| **Plot Twist** | Collaborative storytelling. Bait others into using your secret words. |
 
## How It Works
 
1. Open Icebreaker and pick a username
2. Create a room or join with a room code
3. The host picks a game, everyone plays on their own phone
4. Laugh, argue, crown the winner
## Tech Stack
 
- **Language:** TypeScript
- **Real-time multiplayer:** WebSocket-based room system keeping all clients in sync <!-- adjust: Socket.IO / Firebase / Supabase Realtime etc. -->
- **Client:** <!-- React Native / Expo / etc. -->
- **Backend:** <!-- Node.js / serverless / etc. -->
- **AI referee:** LLM-powered dispute resolution for Link or Sink
## Architecture Highlights
 
- **Room-based sessions:** short shareable codes, host-controlled game selection, players join and leave without breaking game state
- **Authoritative game state:** the server owns state and scoring; clients render and submit actions, preventing desyncs and cheating
- **Disconnect handling:** players can drop mid-round and rejoin without ending the game for everyone else
- **10 games, one engine:** shared primitives (lobbies, rounds, timers, voting, scoring) with per-game logic layered on top, so new games ship fast
## Design Principles
 
- **Zero friction:** no accounts, no emails, no tutorials longer than one screen
- **Everyone on their own phone:** private inputs (secret votes, hidden roles) enable games a shared screen can't do
- **Any group size:** every game scales from 3 players to a full party
## Status
 
 
## Contact
 
Built by Christian Li · chrisjli@umich.edu
 
