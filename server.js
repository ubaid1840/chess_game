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
const { admin, db } = require("./config/firebase")
app.use(express.static(path.join(__dirname)));


io.on('connection', (socket) => {

    socket.on('joinRoom', async ({ roomID, playerID, isHost }) => {
        try {
            const roomRef = db.collection('chess-rooms').doc(roomID);
            const roomDoc = await roomRef.get();

            if (isHost) {
                if (!roomDoc.exists) {
                    // Create a new room
                    const roomData = {
                        roomID,
                        players: [{ playerID, socketID: socket.id, connected: true }],
                        hostID: playerID,
                        gameStarted: false,
                        startTime: null,
                    };
                    await roomRef.set(roomData);
                    socket.join(roomID);
                } else {
                    const room = roomDoc.data();
                    const hostPlayer = room.players.find(p => p.playerID === playerID);
                    if (hostPlayer) {
                        if (room.gameStarted) {
                            socket.emit('gameStarted', { message: 'Game has already started. You cannot join the room.' });
                        } else {
                            hostPlayer.connected = true;
                            hostPlayer.socketID = socket.id;
                            room.startTime = new Date().getTime();
                            await roomRef.update({ players: room.players, startTime: room.startTime });
                            socket.join(roomID);
                        }
                    } else {
                        socket.emit('joinRoomError', { message: 'Host player not found in the room.' });
                        return;
                    }
                }
            } else {
                setTimeout(async () => {
                    const updatedRoomDoc = await roomRef.get();
                    if (!updatedRoomDoc.exists) {
                        socket.emit('joinRoomError', { message: 'Room not found' });
                    } else {
                        const room = updatedRoomDoc.data();
                        if (room.gameStarted) {
                            socket.emit('gameStarted', { message: 'Game has already started. You cannot join the room.' });
                        } else {
                            const existingPlayer = room.players.find(p => p.playerID === playerID);
                            if (existingPlayer) {
                                existingPlayer.connected = true;
                                existingPlayer.socketID = socket.id;
                            } else {
                                room.players.push({ playerID, socketID: socket.id, connected: true });
                            }
                            await roomRef.update({ players: room.players });
                            socket.join(roomID);
                            const playersCount = room.players.filter(p => p.connected).length;

                            if (playersCount === 2) {
                                room.gameStarted = true;
                                room.startTime = new Date().getTime();
                                await roomRef.update({ gameStarted: true, startTime: room.startTime });
                                io.in(roomID).emit('startGame', {
                                    host: { hostID: room.hostID },
                                    players: room.players,
                                });
                            }
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
        try {
            const roomsSnapshot = await db.collection('chess-rooms').get();
            let roomDoc = null;
            let roomData = null;
            roomsSnapshot.forEach(doc => {
                const data = doc.data();
                const player = data.players.find(p => p.socketID === socket.id);
                if (player) {
                    roomDoc = doc;
                    roomData = data;
                }
            });

            if (roomDoc && roomData) {
                io.in(roomData.roomID).emit('gameEnd');

                setTimeout(() => {
                    io.in(roomData.roomID).emit('gamefinished');
                }, 2000);
            } else {
                console.log("Room or player not found for this socketID.");
            }
        } catch (error) {
            console.error('Error handling player disconnect:', error);
        }
    });

    socket.on("movePlayed", (data) => {
        io.in(data.roomID).emit('movePlayedBy', data);
    });

    socket.on("changePiece", (data) => {
        io.in(data.roomID).emit('changePieceBy', data);
    });

    socket.on("timeupdatewhite", (data) => {
        io.in(data.roomID).emit('timeupdatewhite', data);
    });

    socket.on("timeupdateblack", (data) => {
        io.in(data.roomID).emit('timeupdateblack', data);
    });

    socket.on("gameFinished", async (data) => {
        const roomID = data.roomID;
        const playerID = data.playerID;
        const roomRef = db.collection('chess-rooms').doc(roomID);
        const roomDoc = await roomRef.get();
        const room = roomDoc.data();

        if (!room) return;

        const startTime = room.startTime;

        const url = 'https://us-central1-html5-gaming-bot.cloudfunctions.net/callbackpvpgame';
        const sign = 'EvzuKF61x9oKOQwh9xrmEmyFIulPNh';

        const mydata = {
            gameUrl: 'chess',
            method: 'win',
            roomID,
            winnerID: playerID,
            timeStart: startTime
        };

        try {
            await axios.post(url, mydata, {
                headers: {
                    'sign': sign
                }
            });
            io.in(data.roomID).emit('gamefinished');
            await roomRef.delete();
        } catch (error) {
            console.log('Error sending game result:', error);
        }
    });

});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
