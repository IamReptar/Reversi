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

/* set up web socket server */
var io = require('socket.io').listen(app);
io.sockets.on('connection',function(socket){
	function log(){
		var array = ['*** server log message: '];
		for(var i = 0; i < arguments.length; i++){
			array.push(arguments[i]);
			console.log(arguments[i]);
		}
		socket.emit('log',array);
		socket.broadcast.emit('log',array);
	}
	log('a website connected to the server');
	socket.on('disconnect',function(socket){
		log('a website disconnected from the server');
	});

	//join room command.
	// payload:
	//  {
	//       'room': room to join.
	//       'username': username of person joining
  //  }join roon response;{
	//       'result': success,
	//       'room': room joined,
	//       'username': username that joined,
	//       'membership': number of people in room including the one that joined
  //}or {
	//       result: 'fail',
	//       'room': failure message,
  //}
	socket.on('join_room',function(payload){
		log('server recieved a command', 'join_room',payload);
		if(('undefined' === typeof payload) || !payload){
			var error_message = 'join_room had no payload, command stopped';
			log(error_message);
			socket.emit('join_room_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
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
		socket.join(room);
		var roomObject =  io.sockets.adapter.rooms[room];
		if(('undefined' === typeof roomObject) || !roomObject){
			var error_message = 'join_room could not create a room (internal error), command stopped';
			log(error_message);
			socket.emit('join_room_response',		{
																							result: 'fail',
																							message: error_message
																					});
			return;
		}
		var numClients =  roomObject.length;
		var success_data =		{
															result: 'success',
															room: room,
															username: username,
															membership: (numClients +1)
													};
			io.sockets.in(room).emit('join_room_response',success_data);
			log('Room ' + room +' was just joined by ' + username);
			return;
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
