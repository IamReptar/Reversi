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

// this  is a registry of socket ids and player information
var players = [];

/* set up web socket server */
var io = require('socket.io').listen(app);
io.sockets.on('connection',function(socket){
	log('client connection by' + socket.id);

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
		//check that payload has a  room
		var room =  payload.room;
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
		var username =  payload.username;
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
		var roomObject =  io.sockets.adapter.rooms[room];
		//tell everyone already in room that someone  joined
		var numClients =  roomObject.length;
		var success_data =		{
															result: 'success',
															room: room,
															username: username,
															socket_id: socket.id,
															membership: (numClients +1)
													};
			io.sockets.in(room).emit('join_room_response',success_data);

			for( var socket_in_room in roomObject.sockets){
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
	});

	socket.on('disconnect',function(){
		log('client disconnected ' + JSON.stringify(players[socket.id]));
		if('undefined' !==  typeof players[socket.id] && players[socket.id]){
			var username = players[socket.id].username;
			var room = players[socket.id].room;
			var payload =		{
																username: username,
																socket_id: socket.id
														};
			delete players[socket.id];
			io.sockets.in(room).emit('player_disconnected', payload);
		}
	});

	//send_message command.
	// payload:
	//  {
	//       'room': room to join.
	//       'username': username of person sending message,
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
		var room =  payload.room;
		if(('undefined' === typeof room) || !room){
			var error_message = 'send_message did not specify a room, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var username =  payload.username;
		if(('undefined' === typeof username) || !username){
			var error_message = 'send_message did not specify a username, command stopped';
			log(error_message);
			socket.emit('send_message_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var message =  payload.message;
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
		io.sockets.in(room).emit('send_message_response',success_data);
		log('message sent to room '+ room + ' by ' +  username);
	});
});
