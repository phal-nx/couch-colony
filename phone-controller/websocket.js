'use strict';
// Minimal RFC 6455 text-frame WebSocket for Node 8 (the TV's /usr/bin/node).
// No extensions, no binary messages. Clients must mask; servers must not.
var crypto = require('crypto');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function Connection(socket, options) {
  EventEmitter.call(this);
  this.socket = socket;
  this.client = !!options.client;
  this.maxPayload = options.maxPayload || 16384;
  this.buffer = Buffer.alloc(0);
  this.fragments = null;
  this.fragmentBytes = 0;
  this.closed = false;
  this.lastActive = Date.now();
  var self = this;
  socket.setNoDelay(true);
  socket.on('data', function (chunk) { self._receive(chunk); });
  socket.on('drain', function () { self.emit('drain'); });
  socket.on('error', function () { self._finish(); });
  socket.on('close', function () { self._finish(); });
  // Upgraded HTTP sockets allow half-open connections; a peer's FIN ends this one.
  socket.on('end', function () { self._finish(); });
}
util.inherits(Connection, EventEmitter);

Connection.prototype.buffered = function () {
  return this.closed ? 0 : this.socket.bufferSize || 0;
};

Connection.prototype.send = function (text) {
  if (this.closed) return false;
  this._frame(0x1, Buffer.from(String(text), 'utf8'));
  return true;
};

Connection.prototype.ping = function () {
  if (!this.closed) this._frame(0x9, Buffer.alloc(0));
};

Connection.prototype.close = function (code, reason) {
  if (this.closed) return;
  var payload = Buffer.alloc(2);
  payload.writeUInt16BE(code || 1000, 0);
  payload = Buffer.concat([payload, Buffer.from(String(reason || '').slice(0, 100), 'utf8')]);
  this._frame(0x8, payload);
  this.closed = true;
  var socket = this.socket;
  socket.end();
  setTimeout(function () { socket.destroy(); }, 2000).unref();
  this.emit('close', code || 1000);
};

Connection.prototype.terminate = function () {
  this.socket.destroy();
  this._finish();
};

Connection.prototype._finish = function () {
  if (this.closed) return;
  this.closed = true;
  this.socket.destroy();
  this.emit('close', 1006);
};

Connection.prototype._frame = function (opcode, payload) {
  var length = payload.length;
  var header;
  if (length < 126) { header = Buffer.alloc(2); header[1] = length; }
  else if (length < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(length, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(length, 6); }
  header[0] = 0x80 | opcode;
  if (this.client) {
    var mask = crypto.randomBytes(4);
    header[1] |= 0x80;
    var masked = Buffer.alloc(length);
    for (var i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i & 3];
    this.socket.write(Buffer.concat([header, mask, masked]));
  } else this.socket.write(Buffer.concat([header, payload]));
};

Connection.prototype._fail = function (code, reason) {
  this.close(code, reason);
};

Connection.prototype._receive = function (chunk) {
  if (this.closed) return;
  this.lastActive = Date.now();
  this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
  if (this.buffer.length > this.maxPayload + 14) {
    // A partial frame larger than any acceptable message is never buffered.
    var peek = this.buffer[1] & 0x7f;
    if (peek === 127 || (peek === 126 && this.buffer.readUInt16BE(2) > this.maxPayload)) { this._fail(1009, 'Message too large'); return; }
  }
  while (!this.closed && this.buffer.length >= 2) {
    var first = this.buffer[0];
    var second = this.buffer[1];
    var fin = (first & 0x80) !== 0;
    var opcode = first & 0x0f;
    var masked = (second & 0x80) !== 0;
    var length = second & 0x7f;
    var offset = 2;
    if (first & 0x70) { this._fail(1002, 'Extensions are not supported'); return; }
    if (masked === this.client) { this._fail(1002, 'Invalid masking'); return; }
    if (length === 126) {
      if (this.buffer.length < 4) return;
      length = this.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (this.buffer.length < 10) return;
      if (this.buffer.readUInt32BE(2) !== 0) { this._fail(1009, 'Message too large'); return; }
      length = this.buffer.readUInt32BE(6);
      offset = 10;
    }
    if (length > this.maxPayload) { this._fail(1009, 'Message too large'); return; }
    var maskBytes = masked ? 4 : 0;
    if (this.buffer.length < offset + maskBytes + length) return;
    var payload = Buffer.from(this.buffer.slice(offset + maskBytes, offset + maskBytes + length));
    if (masked) {
      var mask = this.buffer.slice(offset, offset + 4);
      for (var i = 0; i < length; i++) payload[i] ^= mask[i & 3];
    }
    this.buffer = this.buffer.slice(offset + maskBytes + length);
    this._handle(fin, opcode, payload);
  }
};

Connection.prototype._handle = function (fin, opcode, payload) {
  if (opcode >= 0x8) {
    if (!fin || payload.length > 125) { this._fail(1002, 'Invalid control frame'); return; }
    if (opcode === 0x8) { this.close(1000); return; }
    if (opcode === 0x9) { this._frame(0xA, payload); return; }
    if (opcode === 0xA) return;
    this._fail(1002, 'Unknown opcode');
    return;
  }
  if (opcode === 0x2) { this._fail(1003, 'Text messages only'); return; }
  if (opcode === 0x1) {
    if (this.fragments) { this._fail(1002, 'Unfinished message'); return; }
    if (fin) { this.emit('message', payload.toString('utf8')); return; }
    this.fragments = [payload];
    this.fragmentBytes = payload.length;
    return;
  }
  if (opcode === 0x0) {
    if (!this.fragments) { this._fail(1002, 'Unexpected continuation'); return; }
    this.fragmentBytes += payload.length;
    if (this.fragmentBytes > this.maxPayload) { this._fail(1009, 'Message too large'); return; }
    this.fragments.push(payload);
    if (!fin) return;
    var message = Buffer.concat(this.fragments).toString('utf8');
    this.fragments = null;
    this.fragmentBytes = 0;
    this.emit('message', message);
    return;
  }
  this._fail(1002, 'Unknown opcode');
};

// Completes a server-side upgrade, or answers 400 and returns null.
function accept(request, socket, head, options) {
  var key = request.headers['sec-websocket-key'];
  var upgrade = String(request.headers.upgrade || '').toLowerCase();
  if (request.method !== 'GET' || upgrade !== 'websocket' || request.headers['sec-websocket-version'] !== '13' ||
      typeof key !== 'string' || Buffer.from(key, 'base64').length !== 16) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n');
  var connection = new Connection(socket, options || {});
  if (head && head.length) connection._receive(head);
  return connection;
}

function reject(socket, status, text) {
  socket.end('HTTP/1.1 ' + status + ' ' + text + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

// Test and tooling client. Calls back with (error, connection).
function connect(url, headers, callback, options) {
  var parsed = new (require('url').URL)(url);
  var key = crypto.randomBytes(16).toString('base64');
  var request = http.request({
    host: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search,
    headers: Object.assign({Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key}, headers || {})
  });
  var done = false;
  request.on('upgrade', function (response, socket, head) {
    done = true;
    if (response.headers['sec-websocket-accept'] !== acceptKey(key)) { socket.destroy(); callback(new Error('Invalid accept key')); return; }
    var connection = new Connection(socket, Object.assign({client: true, maxPayload: 4 * 1024 * 1024}, options || {}));
    if (head && head.length) connection._receive(head);
    callback(null, connection);
  });
  request.on('response', function (response) {
    if (done) return;
    done = true;
    response.resume();
    callback(new Error('Upgrade refused with ' + response.statusCode));
  });
  request.on('error', function (error) { if (!done) { done = true; callback(error); } });
  request.end();
}

module.exports = {accept: accept, reject: reject, connect: connect, Connection: Connection};
