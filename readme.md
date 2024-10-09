# Getting Started

## Firebase setup
Setup firebase project and download serviceAccountKey.json file and save it in config folder and rename it to service_key.json


Run the server

```bash
npm run start
```

Following is the example how the URL parameters should be passed for host and for other players

### For Host

http://localhost:5000/?roomID=2&playerID=1&isHost=true

### For other player

http://localhost:5000/?roomID=2&playerID=2



## Additional Information


Player Disconnection Handling: If a player disconnects from the game, the remaining player is declared the winner.

End of Game Notification: When the game concludes, the following message is sent to the parent window: window.parent.postMessage({ type: 'finished_chess' }, '*').

Winner Notification: To declare a winner, the following message is sent to the parent window: window.parent.postMessage({ type: "win_chess", winner: PLAYER_ID }, "*"), where PLAYER_ID represents the ID of the winning player.

API Post Request: A POST request is made to the API with the following details:

gameUrl: 'chess'
method: 'win'
roomID: The ID of the room where the game was played
winnerID: The ID of the winning player
timeStart: The start time of the game
