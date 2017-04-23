var server = require('http').createServer();
var io = require('socket.io')(server);

var _spawnBubbleInterval = 1000;
var _gameLength = 30000;
var debug = 0;


io.on('connection', function(client){
    
    client.emit('Server Running');
    
    if(debug){//use me for server debugging
        console.log("------- Current Lobbies -------");
        console.log(lobbies);
    }
    
    console.log("client connected")
    
    client.on('Create Lobby',function(data, callback){
        var newLobby = new Lobby(data.lobbyName);
        lobbies.push(newLobby);
        console.log("New Lobby. id: " + newLobby.lobbyID + " name: " + newLobby.name);
        callback({"confirmedName": newLobby.name, "confirmedID": newLobby.lobbyID});
    });
    
    client.on('First Time in Lobby', function(data){
        console.log(data.lobbyID);
        for(var i=0;i<lobbies.length;i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                if(lobbies[i].firstTime == true){
                    io.sockets.in(data.lobbyID).emit("First Time in Lobby", data);
                }
            }
        }
    });
    
    
    client.on('Get Lobbies',function(data, callback){
        var data = lobbies.map(function(item,index){
            return {name:item.name, lobbyID:item.lobbyID};
        },lobbies)
        callback(data);
    });
    
    client.on('Get Lobby Players',function(data, callback){
        for(var i=0;i<lobbies.length;i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                callback(lobbies[i].players)
            }
        }
    });
    
    client.on('Player Join Lobby',function(data, callback){
        for(var i=0;i<lobbies.length;i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                
                var newPlayer = new Player(data.playerName,  client.id)
                lobbies[i].players.push(newPlayer);
                var lobbyData ={
                    yourID: newPlayer.socketID,
                    lobbyID: lobbies[i].lobbyID,
                    lobbyName: lobbies[i].name
                };
                var players = {};
                for(var j=0; j<lobbies[i].players.length; j++){
                    var att = "player"+(j+1);
                    players[att] = {
                        id: lobbies[i].players[j].socketID,
                        name: lobbies[i].players[j].name,
                        wins: lobbies[i].players[j].wins,
                        ready: lobbies[i].players[j].ready,
                    }
                }
                lobbyData.players = players;
                
                io.sockets.in(lobbies[i].lobbyID).emit("New Lobby Member", lobbyData);
                client.join(lobbies[i].lobbyID);
                console.log(lobbyData);
                callback(lobbyData);
            }
        }
    });
    
    client.on('Update Player Score',function(data, callback){
        for(var i=0;i<lobbies.length;i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                for(var j=0;j<lobbies[i].players.length;j++){
                    if(lobbies[i].players[j].socketID == data.playerID && lobbies[i].gameStatus){
                        
                        lobbies[i].players[j].score += parseInt(data.points);
                        var callbackData = {
                            score:lobbies[i].players[j].score
                        }
                        callback(callbackData);
                        
                        client.emit("Update Scoreboard", callbackData);
                        
                    }
                }
            }
        }
    });
    
    client.on('Leaving Lobby',function(data){
        var lobbyIndex;
        for(var i=0;i<lobbies.length;i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                lobbyIndex = i;
                for(var j=0;j<lobbies[i].players.length;j++){
                    if(lobbies[i].players[j].socketID == data.playerID){
                        console.log("Removing Player " + lobbies[i].players[j].socketID);
                        client.leave(lobbies[i].lobbyID);
                        lobbies[i].players.splice(j,1);
                        break;
                    }
                }
            }
        }
        
        if(io.sockets.adapter.rooms[data.lobbyID]){
            emitLobbyPlayers(data.lobbyID)
        }else{
            console.log('Lobby '+data.lobbyID+' removed');
            lobbies.splice(lobbyIndex,1);
        }
    });
    
    client.on('Lobby Start Game',function(data){
        console.log("Starting new game for lobby " + data.lobbyID);
        if(data.gameMode === "ffa"){
            io.sockets.in(data.lobbyID).emit("Lobby Start Game", data);
            for(var i=0;i<lobbies.length;i++){
                if(lobbies[i].lobbyID == data.lobbyID){
                    
                    var id = data.lobbyID;
                    lobbies[i].gameStatus = true;
                    lobbies[i].firstTime = false;
                    
                    for(var j=0;j<lobbies[i].players.length;j++){
                        lobbies[i].players[j].ready = false;
                    }
                    
                    lobbies[i].bubbleSpawner = setInterval(function(){spawnBubble(id)},_spawnBubbleInterval);
                    setTimeout(function(){gameOver_original(id);},1000*data.gameDuration);
                }
            }
        }
        if(data.gameMode === "Survival"){
            console.log("Survival");
            io.sockets.in(data.lobbyID).emit("Lobby Start Game", data);
            for(var i=0;i<lobbies.length;i++){
                if(lobbies[i].lobbyID == data.lobbyID){
                    
                    var id = data.lobbyID;
                    lobbies[i].bubbleWait = 5000;
                    lobbies[i].gameStatus = true;
                    lobbies[i].score = 0;
                    
                    for(var j=0;j<lobbies[i].players.length;j++){
                        lobbies[i].players[j].ready = false;
                    }
                    
                    var lobby = lobbies[i]; 
                    setTimeout(function(){spawnBubble_survival(lobby, id);},lobbies[i].bubbleWait);
                }
            }
        }
    });
    
    client.on('Game Over - Survival',function(data){
        console.log("Game Over - Survival");
        // io.sockets.in(data.lobbyID).emit("End Game", data);
        for(var i = 0; i<lobbies.length; i++){
            if(lobbies[i]){
                if(lobbies[i].lobbyID == data.lobbyID){
                    lobbies[i].gameStatus = false;
                    calcHighScore(lobbies[i]);
                }
            }
        }
    });
    
    function calcHighScore(lobby){
        
        //FOR DEBUGGING ONLY
        var player = new Player("johnny boi", "1000");
        player.score = 10;
        player.ready = true;
        lobby.players.push(player);
        //FOR DEBUGGING ONLY
        
        for(var i=0; i<lobby.players.length; i++){
            lobby.score += lobby.players[i].score;
        }
        if(lobby.score > lobby.highScore){
            lobby.highScore = lobby.score;
        }
        console.log("Score: " + lobby.score);
        console.log("HighScore: " + lobby.highScore);
        sendRoundData(lobby);
    }
    
    function sendRoundData(lobby){
        var data = {
            lobbyID: lobby.lobbyID
        };
        var players = {};
        var roundData = {};
        for(var i=0; i<lobbies.length; i++){
            if(lobbies[i].lobbyID == lobby.lobbyID){
                
                var att = "roundData";
                roundData[att] = {
                    lobbyID: lobbies[i].lobbyID,
                    name: lobbies[i].name,
                    score: lobbies[i].score,
                    highScore: lobbies[i].highScore,
                }
                
                for(var j=0; j<lobbies[i].players.length; j++){
                    var att = "player"+(j+1);
                    players[att] = {
                        id: lobbies[i].players[j].socketID,
                        name: lobbies[i].players[j].name,
                        score: lobbies[i].players[j].score,
                        wins: lobbies[i].players[j].wins,
                        ready: lobbies[i].players[j].ready,
                    }
                }
            }

        }
        data.roundData = roundData;
        data.players = players;
        io.sockets.in(lobby.lobbyID).emit("End Game", data);
    }
    
    client.on('waiting in lobby',function(data){
        console.log("Waiting In Lobby: ");
        console.log(data.ready);
        for(var i=0; i<lobbies.length; i++){
            if(lobbies[i].lobbyID == data.lobbyID){
                for(var j=0; j<lobbies[i].players.length; j++){
                    if(lobbies[i].players[j].socketID == data.playerID){
                        console.log(lobbies[i].players[j].name + " is waiting");
                        lobbies[i].players[j].ready = true;
                        // io.sockets.in(data.lobbyID).emit("Player Ready", data);
                    }
                }
                console.log("CHECK WHOSE IN LOBBY");
                var playersInLobby = 0;
                for(var j=0; j<lobbies[i].players.length; j++){
                    console.log(lobbies[i].players[j].name + ": " + lobbies[i].players[j].ready);
                    if(lobbies[i].players[j].ready){
                        playersInLobby++;
                    }
                }
                if(playersInLobby == lobbies[i].players.length){
                    sendPlayerData(lobbies[i]);
                    io.sockets.in(data.lobbyID).emit("All Players Ready", data);
                    console.log("All players are ready");
                }
                else{
                    console.log("Some Players are not in the lobby yet");
                    sendPlayerData(lobbies[i]);
                }
            }
        }
    });
    
    function sendPlayerData(lobby){
        var data = {
            lobbyID: lobby.lobbyID
        };
        var players = {};
        for(var i=0; i<lobbies.length; i++){
            if(lobbies[i].lobbyID == lobby.lobbyID){
                for(var j=0; j<lobbies[i].players.length; j++){
                    var att = "player"+(j+1);
                    players[att] = {
                        id: lobbies[i].players[j].socketID,
                        name: lobbies[i].players[j].name,
                        wins: lobbies[i].players[j].wins,
                        ready: lobbies[i].players[j].ready,
                    }
                }
            }

        }
        data.players = players;
        io.sockets.in(lobby.lobbyID).emit("Player Ready", data);
    }
    
    client.on('Shots Fired',function(data){
        io.sockets.in(data.lobbyID).emit("Spawn Projectile", data);
    });
    
    
    
    function emitLobbyPlayers(lobbyID){
        var data = {
            lobbyID:lobbyID
        };
        var players = {};
        for(var i=0; i<lobbies.length; i++){
            if(lobbies[i].lobbyID == lobbyID){
                for(var j=0; j<lobbies[i].players.length; j++){
                    var att = "player"+(j+1);
                    players[att] = {
                        id: lobbies[i].players[j].socketID,
                        name: lobbies[i].players[j].name,
                        wins: lobbies[i].players[j].wins,
                        ready: lobbies[i].players[j].ready,
                    }
                }
            }

        }
        data.players = players;
        console.log(data);
        io.sockets.in(lobbyID).emit("New Lobby Member", data);
    }
    
    
    function spawnBubble(lobbyID){
        var newBubble = new Bubble();
        newBubble.xPos = (Math.random()*2 - 1); //between -1 and 1 
        newBubble.zPos = (Math.random()*2 - 1); //between -1 and 1 
        newBubble.radius = (Math.random() + 1)/2; //between 0.5 and 1 
        newBubble.moveSpeed = (Math.random() + 1)/2; //between -1 and 1 
        newBubble.frequency = Math.random();//between 0 and 1 
        newBubble.amplitude = Math.random();//between 0 and 1 
        
        if(Math.random() < 0.1) newBubble.type = 'gold';
        else newBubble.type = 'regular';
        io.sockets.in(lobbyID).emit("Spawn Bubble", newBubble);
    }
    
    function spawnBubble_survival(lobby, lobbyID){
        
        if(lobby.gameStatus){
            var newBubble = new Bubble();
            newBubble.xPos = (Math.random()*2 - 1); //between -1 and 1 
            newBubble.zPos = (Math.random()*2 - 1); //between -1 and 1 
            newBubble.radius = (Math.random() + 1)/2; //between 0.5 and 1 
            newBubble.moveSpeed = (Math.random() + 1)/2; //between -1 and 1 
            newBubble.frequency = Math.random();//between 0 and 1 
            newBubble.amplitude = Math.random();//between 0 and 1 
            newBubble.type = 'regular';
            
            io.sockets.in(lobbyID).emit("Spawn Bubble", newBubble);
            if(lobby.bubbleWait >= 100){
                lobby.bubbleWait -= 10;
            }
            
            setTimeout(function(){spawnBubble_survival(lobby, lobbyID);},lobby.bubbleWait);
        }
        
    }
    
    function resetPlayerScores(lobby){
        for(var j=0; j < lobby.players.length; j++){
            lobby.players[j].score = 0;
        }
    }
    
    function calcWinner(lobby){
        
        //FOR DEBUGGING ONLY
        // var player = new Player("johnny boi", "1000");
        // player.score = 10;
        // player.ready = false;
        // lobby.players.push(player);
        //FOR DEBUGGING ONLY
        
        lobby.players.sort(function(a, b){return b.score-a.score});
        console.log("WINNER(S)");
        console.log(lobby.players[0].name + " : " + lobby.players[0].score);
        lobby.players[0].wins += 1;
        for(var i=1; i<lobby.players.length; i++){
            if(lobby.players[i].score == lobby.players[0].score){
                console.log(lobby.players[i].name + " : " + lobby.players[i].score);
                lobby.players[i].wins += 1;
            }
        }
    }
    
    function gameOver_original(lobbyID){
        for(var i = 0; i<lobbies.length; i++){
            if(lobbies[i]){
                if(lobbies[i].lobbyID == lobbyID){
                    lobbies[i].gameStatus = false;
                    calcWinner(lobbies[i]);
                }
            }
        }
        sendEndGameMessage(lobbyID);
    }
    
    function sendEndGameMessage(lobbyID){
        console.log("Ending game for lobby " + lobbyID)
        var data = {
            lobbyID:lobbyID
        };
        var players = {};
        for(var i=0; i<lobbies.length; i++){
            if(lobbies[i].lobbyID == lobbyID){
                for(var j=0; j<lobbies[i].players.length; j++){
                    var att = "player"+(j+1);
                    players[att] = {
                        id: lobbies[i].players[j].socketID,
                        name: lobbies[i].players[j].name,
                        score: lobbies[i].players[j].score,
                        wins: lobbies[i].players[j].wins,
                        ready: lobbies[i].players[j].ready
                    }
                    lobbies[i].players[j].score = 0;
                }
            }

        }
        data.players = players;
        
        io.sockets.in(lobbyID).emit("End Game", data);
        
        for(var i = 0; i<lobbies.length; i++){
            if(lobbies[i]){
                if(lobbies[i].lobbyID == lobbyID){
                    clearInterval(lobbies[i].bubbleSpawner);
                }
            }
        }
    }
    
    client.on('disconnect', function(){
        
        console.log('Socket Disconnected. id: ' + client.id);
        
        var anyLobbies = false;
        for(var i = 0; i<currentLobbyCount; i++){
            if(lobbies[i]){
                if(io.sockets.adapter.rooms[lobbies[i].lobbyID]){
                    anyLobbies = true;
                    for(var j=0; j<4; j++){
                        if(lobbies[i].players[j]){
                            if(lobbies[i].players[j].socketID == client.id){
                                console.log("Player " + client.id + " removed from room " + lobbies[i].lobbyID);
                                lobbies[i].players.splice(j,1);
                                emitLobbyPlayers(i);
                            }
                        }
                        
                    }
                } else{
                    console.log('Lobby '+lobbies[i].lobbyID+' removed');
                    clearInterval(lobbies[i].bubbleSpawner);//ClearInterval will stop the bubble-spawning function calls
                    lobbies.splice(i,1);
                }
            }
        }
        
        if(!anyLobbies){
            console.log('No active games. Restarting lobby counter');
            currentLobbyCount = 0;
        }
        
    });
    
    client.on('event', function(data){});
    

  
});

var currentLobbyCount = 0;
var lobbies = [];
var activeLobbies = [];

function Player(name, sID){
    this.name = name;
    this.socketID = sID;
    this.wins = 0;
    this.score = 0;
    this.ready = true;
}
function Lobby(name){
    this.firstTime = true;
    this.lobbyID = generateLobbyID();
    this.name = name;
    this.players = [];
    this.bubbles = [];
    this.bubbleSpawner;
    this.bubbleWait;
    this.gameStatus = false;
    //survival mode
    this.score = 0;
    this.highScore = 0; 
}
function Bubble(){
    this.id;
    this.type;
    this.xPos;
    this.zPos;
    this.radius;
    this.moveSpeed;
    this.frequency;
    this.amplitude;
}

function generateLobbyID(){
    return currentLobbyCount++;
}

console.log("Let's Fire");
server.listen(8080);