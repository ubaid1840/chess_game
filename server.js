const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || 'your_mongodb_uri';

app.use(express.static(path.join(__dirname)));

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const roomSchema = new mongoose.Schema({
    roomID: String,
    players: [{
        playerID: String,
        playerName: String,
        socketID: String,
        connected: { type: Boolean, default: true }
    }],
    numOfPlayers: Number,
    createdAt: { type: Date, default: Date.now },
    hostID: String,
    hostName: String,
    gameStarted: { type: Boolean, default: false },
    startTime: String,
});

const Room = mongoose.model('Room', roomSchema);

io.on('connection', (socket) => {

    socket.on('joinRoom', async ({ roomID, playerID, playerName, numOfPlayers, isHost }) => {
        try {
            let room = await Room.findOne({ roomID });

            if (isHost) {
                if (!room) {
                    room = new Room({
                        roomID,
                        players: [{ playerID, playerName, socketID: socket.id, connected: true }],
                        numOfPlayers,
                        hostID: playerID,
                        hostName: playerName,
                        gameStarted: false
                    });
                    await room.save();
                    socket.join(roomID);
                } else {

                    const hostPlayer = room.players.find(p => p.playerID === playerID);
                    if (hostPlayer) {
                        if (room.gameStarted) {
                            socket.emit('gameStarted', { message: 'Game has already started. You cannot join the room.' });
                        } else {
                            hostPlayer.connected = true;
                            hostPlayer.socketID = socket.id;
                            room.hostID = playerID;
                            room.hostName = playerName;
                            room.numOfPlayers = numOfPlayers;
                            room.startTime = new Date().getTime();
                            await room.save();
                            socket.join(roomID);
                        }
                    } else {
                        socket.emit('joinRoomError', { message: 'Host player not found in the room.' });
                        return;
                    }
                }
            } else {
                setTimeout(async () => {
                    room = await Room.findOne({ roomID });
                    if (!room) {
                        socket.emit('joinRoomError', { message: 'Room not found' });
                    } else if (room.gameStarted) {
                        socket.emit('gameStarted', { message: 'Game has already started. You cannot join the room.' });
                    } else {
                        const existingPlayer = room.players.find(p => p.playerID === playerID);
                        if (existingPlayer) {
                            existingPlayer.connected = true;
                            existingPlayer.socketID = socket.id;
                        } else {
                            room.players.push({ playerID, playerName, socketID: socket.id, connected: true });
                        }
                        await room.save();
                        socket.join(roomID);
                        const playersCount = room.players.filter(p => p.connected).length;
                        io.in(roomID).emit('waiting', { playersCount, numOfPlayers: room.numOfPlayers });

                        if (playersCount === room.numOfPlayers) {
                            room.gameStarted = true;
                            room.startTime = new Date().getTime();
                            await room.save();
                            io.in(roomID).emit('startGame', {
                                host: {
                                    hostID: room.hostID,
                                    hostName: room.hostName
                                },
                                players: room.players
                            });
                        }
                    }
                }, 5000);
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('joinRoomError', { message: 'Error joining room. Please try again.' });
        }
    });

    socket.on('playerDisconnectData', async () => {
        const room = await Room.findOne({ 'players.socketID': socket.id });
        if (room) {
            io.in(room.roomID).emit('gameEnd');
            setTimeout(()=>{
                io.in(room.roomID).emit('gamefinished');
            },2000)
           
        }
    });

    socket.on("movePlayed", (data) => {
        io.in(data.roomID).emit('movePlayedBy', data);
    });

    socket.on("changePiece", (data) => {
        io.in(data.roomID).emit('changePieceBy', data);
    });

    socket.on("gameFinished", async (data) => {
        const roomID = data.roomID;
        const playerID = data.playerID;
        const room = await Room.findOne({ roomID });
        const startTime = room.startTime;

        const url = 'https://us-central1-html5-gaming-bot.cloudfunctions.net/callbackpvpgame';
        const sign = 'EvzuKF61x9oKOQwh9xrmEmyFIulPNh';

        const mydata = {
            gameUrl: 'chess',
            method: 'win',
            roomID: roomID,
            winnerID: playerID,
            timeStart: startTime
        };

        try {
            await axios.post(url, mydata, {
                headers: {
                    'sign': sign
                }
            }).then(async () => {
                io.in(data.roomID).emit('gamefinished');
                await Room.deleteOne({ roomID });
            });

        } catch (error) {
            console.log('Error sending game result:', error);
        }
    });

});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
