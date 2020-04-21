/* Include static file webserver library */
var static = require('node-static');

/* Include http server library */
var http = require('http');

/* Assume that we are running on Heroku */
var port = process.env.PORT;
var directory = __dirname + '/public';

/* If we aren't on Heroku then we need to readjust the port and directory information and we know that because the port won't be set. */
if(typeof port == 'undefined' || !port){
	directory = './public';
	port = 8080;
}

/* Set up a static web server that will deliver files from the filesystem */
var file = new static.Server(directory);

/* Construct an http server that gets files from the file server */
var app = http.createServer(
	function(request,response){
		request.addListener('end',
			function(){
				file.serve(request,response);
			}
		).resume();
	}
).listen(port);

console.log('Server running fine');

// this is a registry of socket ids and player information
var players = [];

/* set up web socket server */
var io = require('socket.io').listen(app);
io.sockets.on('connection',function(socket){
	log('client connection by ' + socket.id);

	function log(){
		var array = ['*** server log message: '];
		for(var i = 0; i < arguments.length; i++){
			array.push(arguments[i]);
			console.log(arguments[i]);
		}
		socket.emit('log',array);
		socket.broadcast.emit('log',array);
	}

	//join room command.
	// payload:
	//  {
	//       'room': room to join.
	//       'username': username of person joining
  //  }join roon response;{
	//       'result': success,
	//       'room': room joined,
	//       'username': username that joined,
	//       'socket_id': socket id of the person joined,
	//       'membership': number of people in room including the one that joined
  //}or {
	//       result: 'fail',
	//       'room': failure message,
  //}
	socket.on('join_room',function(payload){
		log('\'join room\' command' + JSON.stringify(payload));
		//check that client sent payload
		if(('undefined' === typeof payload) || !payload){
			var error_message = 'join_room had no payload, command stopped';
			log(error_message);
			socket.emit('join_room_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		//check that payload has a room
		var room = payload.room;
		if(('undefined' === typeof room) || !room){
			var error_message = 'join_room did not specify a room, command stopped';
			log(error_message);
			socket.emit('join_room_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		//check that a username was provided
		var username = payload.username;
		if(('undefined' === typeof username) || !username){
			var error_message = 'join_room did not specify a username, command stopped';
			log(error_message);
			socket.emit('join_room_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		//store info about new player
		players[socket.id] = {};
		players[socket.id].username = username;
		players[socket.id].room = room;

		//assign client to room
		socket.join(room);
		//get room object
		var roomObject = io.sockets.adapter.rooms[room];
		//tell everyone already in room that someone joined
		var numClients = roomObject.length;
		var success_data =		{
															result: 'success',
															room: room,
															username: username,
															socket_id: socket.id,
															membership: (numClients)
													};
			io.in(room).emit('join_room_response',success_data);

			for(var socket_in_room in roomObject.sockets){
				var success_data =		{
																	result: 'success',
																	room: room,
																	username: players[socket_in_room].username,
																	socket_id: socket_in_room,
																	membership: numClients
															};
					socket.emit('join_room_response', success_data);
			}
			log('join room success');
			if(room !== 'lobby'){
				send_game_update(socket,room,'initial update');
			}
	});

	socket.on('disconnect',function(){
		log('client disconnected ' + JSON.stringify(players[socket.id]));
		if('undefined' !== typeof players[socket.id] && players[socket.id]){
			var username = players[socket.id].username;
			var room = players[socket.id].room;
			var payload =		{
																username: username,
																socket_id: socket.id
														};
			delete players[socket.id];
			io.in(room).emit('player_disconnected', payload);
		}
	});

	//send_message command.
	// payload:
	//  {
	//       'room': room to join.
	//       'message': message to send
	//  }send_message response;{
	//       'result': success,
	//       'username': username of person that spoke,
	//       'message': message to send
	//}or {
	//       result: 'fail',
	//       'room': failure message,
	//}
	socket.on('send_message',function(payload){
		log('server recieved a command', 'send_message',payload);
		if(('undefined' === typeof payload) || !payload){
			var error_message = 'send_message had no payload, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var room = payload.room;
		if(('undefined' === typeof room) || !room){
			var error_message = 'send_message did not specify a room, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var username = players[socket.id].username;
		if(('undefined' === typeof username) || !username){
			var error_message = 'send_message did not specify a username, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var message = payload.message;
		if(('undefined' === typeof message) || !message){
			var error_message = 'send_message did not specify a message, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}

		var success_data = {
													result: 'success',
													room: room,
													username: username,
													message: message
												};
		io.in(room).emit('send_message_response',success_data);
		log('message sent to room '+ room + ' by ' + username);
	});

//invite command.
// payload:
//  {
//       'requested_user': socket id of the person of person to be invited,
//  }invite response;{
//       'result': success,
//       'socket_id': socketid of person being invited,
//}or {
//       result: 'fail',
//       'room': failure message,
//}
//  }invited response;{
//       'result': success,
//       'socket_id': socketid of person being invited,
//}or {
//       result: 'fail',
//       'room': failure message,
//}
socket.on('invite',function(payload){
	log('invite with '+ JSON.stringify(payload));
	//check to make sure payload sent
	if(('undefined' === typeof payload) || !payload){
		var error_message = 'invite had no payload, command stopped';
		log(error_message);
		socket.emit('invite_response',		{
																						result: 'fail',
																						message: error_message
																				});
		return;
	}
	//check that message can be traced to a username
	var username = players[socket.id].username;
	if(('undefined' === typeof username) || !username){
		var error_message = 'invite can\'t identify who sent an invite the message, command stopped';
		log(error_message);
		socket.emit('invite_response',		{
																						result: 'fail',
																						message: error_message
																				});
		return;
	}
	var requested_user = payload.requested_user;
	if(('undefined' === typeof requested_user) || !requested_user){
		var error_message = 'invite did not specify a requested user, command stopped';
		log(error_message);
		socket.emit('invite_response',		{
																						result: 'fail',
																						message: error_message
																				});
		return;
	}
	var room = players[socket.id].room;
	var roomObject = io.sockets.adapter.rooms[room];

	//make sure the user being invited is in the room
	if(!roomObject.sockets.hasOwnProperty(requested_user)){
		var error_message = 'invite requested a user that was not in the room, command stopped';
		log(error_message);
		socket.emit('invite_response',		{
																						result: 'fail',
																						message: error_message
																				});
		return;
	}

	//if everything is ok respond to inviter that it was successful
	var success_data = 		{
																		result: 'success',
																		socket_id: requested_user
												};
	socket.emit('invite_response', success_data);

	//tell the invitee that they have been invited.
	var success_data = 		{
																		result: 'success',
																		socket_id: socket.id
												};
	socket.to(requested_user).emit('invited', success_data);

	log('invite successful');
	});

	//uninvite command.
	// payload:
	//  {
	//       'requested_user': socket id of the person of person to be uninvited,
	//  }uninvite response;{
	//       'result': success,
	//       'socket_id': socketid of person being uninvited,
	//}or {
	//       result: 'fail',
	//       'room': failure message,
	//}
	//  }uninvited response;{
	//       'result': success,
	//       'socket_id': socketid of person doing the uninviting,
	//}or {
	//       result: 'fail',
	//       'room': failure message,
	//}
	socket.on('uninvite',function(payload){
		log('uninvite with '+ JSON.stringify(payload));
		//check to make sure payload sent
		if(('undefined' === typeof payload) || !payload){
			var error_message = 'uninvite had no payload, command stopped';
			log(error_message);
			socket.emit('uninvite_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		//check that message can be traced to a username
		var username = players[socket.id].username;
		if(('undefined' === typeof username) || !username){
			var error_message = 'uninvite can\'t identify who sent an invite the message, command stopped';
			log(error_message);
			socket.emit('uninvite_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var requested_user = payload.requested_user;
		if(('undefined' === typeof requested_user) || !requested_user){
			var error_message = 'uninvite did not specify a requested user, command stopped';
			log(error_message);
			socket.emit('uninvite_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var room = players[socket.id].room;
		var roomObject = io.sockets.adapter.rooms[room];

		//make sure the user being invited is in the room
		if(!roomObject.sockets.hasOwnProperty(requested_user)){
			var error_message = 'invite requested a user that was not in the room, command stopped';
			log(error_message);
			socket.emit('invite_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}

		//if everything is ok respond to uninviter that it was successful
		var success_data = 		{
																			result: 'success',
																			socket_id: requested_user
													};
		socket.emit('uninvite_response', success_data);

		//tell the uninvitee that they have been uninvited.
		var success_data = 		{
																			result: 'success',
																			socket_id: socket.id
													};
		socket.to(requested_user).emit('uninvited', success_data);

		log('uninvite successful');
		});

		//game_start command.
		// payload:
		//  {
		//       'requested_user': socket id of the person of person to play with,
		//  }game_start response;{
		//       'result': success,
		//       'socket_id': socket_id of person you are playing with,
		//       'game_id': id of the game session
		//}or {
		//       result: 'fail',
		//       'room': failure message,
		//}
		socket.on('game_start',function(payload){
			log('game_start with '+ JSON.stringify(payload));
			//check to make sure payload sent
			if(('undefined' === typeof payload) || !payload){
				var error_message = 'game_start had no payload, command stopped';
				log(error_message);
				socket.emit('game_start_response',		{
																								result: 'fail',
																								message: error_message
																						});
				return;
			}
			//check that message can be traced to a username
			var username = players[socket.id].username;
			if(('undefined' === typeof username) || !username){
				var error_message = 'game_start can\'t identify who sent an invite the message, command stopped';
				log(error_message);
				socket.emit('game_start_response',		{
																								result: 'fail',
																								message: error_message
																						});
				return;
			}
			var requested_user = payload.requested_user;
			if(('undefined' === typeof requested_user) || !requested_user){
				var error_message = 'game_start did not specify a requested user, command stopped';
				log(error_message);
				socket.emit('game_start_response',		{
																								result: 'fail',
																								message: error_message
																						});
				return;
			}
			var room = players[socket.id].room;
			var roomObject = io.sockets.adapter.rooms[room];

			//make sure the user being invited is in the room
			if(!roomObject.sockets.hasOwnProperty(requested_user)){
				var error_message = 'game_start requested a user that was not in the room, command stopped';
				log(error_message);
				socket.emit('game_start_response',		{
																								result: 'fail',
																								message: error_message
																						});
				return;
			}

			//if everything is ok respond to the game_starter that it was successful
			var game_id = Math.floor((1 + Math.random()) *0x10000).toString(16).substring(1);
			var success_data = 		{
																				result: 'success',
																				socket_id: requested_user,
																				game_id: game_id
														};
			socket.emit('game_start_response', success_data);

			//tell other player to play.
			var success_data = 		{
																				result: 'success',
																				socket_id: socket.id,
																				game_id: game_id
														};
			socket.to(requested_user).emit('game_start_response', success_data);

			log('game_start successful');
			});

			//play_token command.
			// payload:
			//  {
			//       'row': 0-7 row to play token on,
			//       'column': 0-7 column to play token on,
			//       'color': 'white' or 'black'
			//  }//if  a successful message will be followed  by  a  game update message
			//     play_token response;{
			//       'result': success,
			//}or {
			//       result: 'fail',
			//       'room': failure message,
			//}
			socket.on('play_token',function(payload){
				log('play_token with '+ JSON.stringify(payload));
				//check to make sure payload sent
				if(('undefined' === typeof payload) || !payload){
					var error_message = 'play_token had no payload, command stopped';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				//check that player has previously registered
				var player = players[socket.id];
				if(('undefined' === typeof player) || !player){
					var error_message = 'server does not recognize you, try going back a screen';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var username = players[socket.id].username;
				if(('undefined' === typeof username) || !username){
					var error_message = 'play_token can not identify who sent the message';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var game_id = players[socket.id].room;
				if(('undefined' === typeof game_id) || !game_id){
					var error_message = 'play_token can not find your game board';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var row = payload.row;
				if(('undefined' === typeof row) || row < 0 || row > 7){
					var error_message = 'play_token did not find the specified row';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var column = payload.column;
				if(('undefined' === typeof column) || column <0 || column >7){
					var error_message = 'play_token did not find specify valid column, command stopped';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var color = payload.color;
				if(('undefined' === typeof color) || !color || (color!= 'white' && color != 'black')){
					var error_message = 'play_token did not find specify valid color, command stopped';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}
				var game = games[game_id];
				if(('undefined' === typeof game) || !game ){
					var error_message = 'play_token could not find your game board';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}

				//if the  current attempt at  playing a token is out of turn then error
				if(color !== game.whose_turn){
					var error_message = 'play_token message played out of turn';
					log(error_message);
					socket.emit('play_token_response',		{
																									result: 'fail',
																									message: error_message
																							});
					return;
				}

				//if the wrong socket is playing the color
				if(
					((game.whose_turn === 'white') && (game.player_white.socket != socket.id)) ||
					((game.whose_turn === 'black') && (game.player_black.socket != socket.id))
				  ){
							var error_message = 'play_token turn played by wrong player';
							log(error_message);
							socket.emit('play_token_response',		{
																											result: 'fail',
																											message: error_message
																									});
							return;
				   }

				var success_data = 		{
																			result: 'success'
															};
				socket.emit('play_token_response', success_data);
				//execute move
				if(color == 'white'){
					game.board[row][column] = 'w';
					game.whose_turn = 'black';
					game.legal_moves = calculate_valid_moves('b', game.board);
				} else if(color == 'black'){
					game.board[row][column] = 'b';
					game.whose_turn = 'white';
					game.legal_moves = calculate_valid_moves('w', game.board);
				}
				var d = new Date();
				game.last_move_time = d.getTime();
				send_game_update(socket,game_id,'played a token');
			});
});

//********************************************
// Code related to game state

var games = [];

function create_new_game(){
	var new_game = {};
	new_game.player_white = {};
	new_game.player_black = {};
	new_game.player_white.socket = '';
	new_game.player_white.username = '';
	new_game.player_black.socket = '';
	new_game.player_black.username = '';

	var d = new Date();
	new_game.last_move_time = d.getTime();

	new_game.whose_turn = 'black';
	new_game.board = [
								      [' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ','w','b',' ',' ',' '],
											[' ',' ',' ','b','w',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' ']
	                 ];
	new_game.legal_moves = calculate_valid_moves('b', new_game.board);
	return new_game;
}

//check if there is a color 'who' on the line starting at  r,c or anywhere frther by adding  dr and dc to r,c
function check_line_match(who,dr,dc,r,c,board){
	if(board[r][c] === who){
		return true;
	}
	if(board[r][c] === ' '){
		return false;
	}
	if( (r+dr < 0) || (r+dr > 7)) {
		return false;
	}
	if( (c+dc < 0) || (c+dc > 7)){
		return false;
	}
	return check_line_match(who,dr,dc,r+dr,c+dc,board);
}

//check  if position at r,c contains the  opposite of who at the board and if  line
//indicated by adding  dr to c eventually ends in the who color.
function valid_move(who,dr,dc,r,c,board){
	var other;
	if(who === 'b'){
		other = 'w';
	}else if (who === 'w') {
		other = 'b';
	}else{
		log('Houston we have a color problem: '+ who);
		return false;
	}

	if( (r+dr < 0) || (r+dr > 7)){
		return false;
	}
	if( (c+dc < 0) || (c+dc > 7)){
		return false;
	}
	if(board[r+dr][c+dc] !=  other){
		return false;
	}

	if( (r+dr+dr < 0) || (r+dr+dr > 7)){
		return false;
	}
	if( (c+dc+dc < 0) || (c+dc+dc > 7)){
		return false;
	}
	return(check_line_match(who,dr,dc,r+dr+dr,c+dc+dc,board));
}

function calculate_valid_moves(who, board){
	var valid = [
								      [' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' '],
											[' ',' ',' ',' ',' ',' ',' ',' ']
	                 ];
	for(var row = 0; row < 8; row++){
		for(var column = 0; column < 8; column++){
			if(board[row][column] === ' '){
				nw = valid_move(who,-1,-1,row,column,board);
				nn = valid_move(who,-1,0,row,column,board);
				ne = valid_move(who,-1,1,row,column,board);

				ww = valid_move(who,0,-1,row,column,board);
				ee = valid_move(who,0,1,row,column,board);

				sw = valid_move(who,1,-1,row,column,board);
				ss = valid_move(who,1,0,row,column,board);
				se = valid_move(who,1,1,row,column,board);
				if(nw||nn||ne||ww||ee||sw||ss||se){
					valid[row][column] = who;
			  }
			}
		}
	}
	return valid;
}



function send_game_update(socket, game_id, message){
	//check to see if a game with game id already exists.
	if(('undefined' === typeof games[game_id]) || !games[game_id]){
		//no game exists so make one
		console.log('no game exists, creating '+ game_id+' for ' + socket.id);
		games[game_id] = create_new_game();
	}
	//make sure only 2 people are in the game room
	var roomObject;
	var numClients;
	do{
		roomObject = io.sockets.adapter.rooms[game_id];
		numClients= roomObject.length;
		if(numClients > 2){
			console.log('too many clients in room: '+game_id+' #: '+ numClients);
			if(games[game_id].player_white.socket == roomObject.sockets[0]){
				games[game_id].player_white.socket = '';
				games[game_id].player_white.username = '';
			}
			if(games[game_id].player_black.socket == roomObject.sockets[0]){
				games[game_id].player_black.socket = '';
				games[game_id].player_black.username = '';
			}
			//kick out the extra socket. one of the extra people
			var sacrifice = Object.keys(roomObject.sockets)[0];
			io.of('/').connected[sacrifice].leave(game_id);
		}
	}
	while((numClients-1) > 2);

	//assign socket a color
	//if current player isnt assigned color
	if((games[game_id].player_white.socket != socket.id) && (games[game_id].player_black.socket != socket.id)){
		console.log('Player is not assigned a color: '+socket.id);
		//and there isnt a color to give them
		if((games[game_id].player_black.socket != '') &&(games[game_id].player_white.socket != '')){
			games[game_id].player_white.socket = '';
			games[game_id].player_white.username = '';
			games[game_id].player_black.socket = '';
			games[game_id].player_black.username = '';
		}
	}
	//assign colors to players if not done already.
	if(games[game_id].player_white.socket == ''){
		if(games[game_id].player_black.socket != socket.id){
			games[game_id].player_white.socket = socket.id;
			games[game_id].player_white.username = players[socket.id].username;
		}
	}
	if(games[game_id].player_black.socket == ''){
		if(games[game_id].player_white.socket != socket.id){
			games[game_id].player_black.socket = socket.id;
			games[game_id].player_black.username = players[socket.id].username;
		}
	}
	//send game update
	var success_data = {
		                     result: 'success',
												 game: games[game_id],
												 message: message,
												 game_id: game_id
	                   };
	io.in(game_id).emit('game_update', success_data);

	//check if game is over
	var row, column;
	var count = 0;
	for(row = 0; row < 8; row++){
		for(column = 0; column < 8; column++){
			if(games[game_id].board[row][column] != ' '){
				count++;
			}
		}
	}
	if(count == 64){
		//send game over
		var success_data = {
													result: 'success',
													game: games[game_id],
													who_won: 'everyone',
													game_id: game_id
											 };
		io.in(game_id).emit('game_over', success_data);

		//delete old games
		setTimeout(function(id){
			return function(){
				delete games[id];
			}} (game_id),6*60*1000);
	}

}
