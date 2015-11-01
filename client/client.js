"use strict";

function debug(msg) {
  if (Session.get('debug') === true) {
    console.log(msg);
  }
}

Meteor.startup( function() {
  Session.set("playing", false);
  window.instrument = new Instrument();
  Meteor.call('userPings');

  // Set language
  TAPi18n.setLanguage(navigator.language || navigator.userLanguage);

  // Notification options
  toastr.options = {
    positionClass: "toast-bottom-left",
    preventDuplicates: true
  }
});

Template.home.helpers({
  rooms: function() {
    return Polytunes.Rooms.find({ isPublic: true });
  }
});

Template.create.onCreated(function() {
  Meteor.call('createRoom', { isPublic: false }, function(error, roomId) {
    Router.go('roomPlay', { '_id': roomId });
  });
});

Template.join.onCreated(function() {

  // Join a public room with one other player (no more, no less)
  let room = Polytunes.Rooms.findOne({ isPublic: true, 'players.0': { $exists: true }, 'players.1': { $exists: false } });
  if (room) {
    Router.go("roomPlay", { _id: room._id });
    return;
  }

  // Else join an empty public room
  room = Polytunes.Rooms.findOne({ isPublic: true, 'players.0': { $exists: false } });
  if (room) {
    Router.go("roomPlay", { _id: room._id });
    return;
  }

  // Else create a new public room
  Meteor.call("createRoom", { isPublic: true }, function(error, roomId) {
    Router.go("roomPlay", { _id: roomId });
  });
});

Template.roomPlay.helpers({
  notLogged: function () {
    return ! Meteor.user().profile.name
  },
  notEnoughPlayers: function() {
    return (this.room.players.length < 2);
  }
});

Template.waitingForPlayers.helpers({
  isPublic: function() {
    return this.room.isPublic;
  }
});

Template.roomPlay.onCreated(function() {
  let room = this.data.room;

  if (room.players.length >= 2) {
    toastr.info(TAPi18n.__('room-full-watch-mode'));
    Router.go("roomWatch", { _id: room._id });
  }

  Session.set("currentRoom", room);
  Meteor.call("userJoinsRoom", room._id);
});

Template.roomPlay.onDestroyed(function() {
  let room = this.data.room;
  Meteor.call("userLeavesRoom", room._id);
  if (Session.get("playing")) {
    window.togglePlay();
  }
  Session.set("currentRoom", null);
});

Template.roomWatch.onCreated(function() {
  let room = this.data.room;
  Session.set("currentRoom", room);
});

let boardData;
Template.board.helpers({
  rows: function () {
    let room = this.room;

    if (!room)
      return false;

    boardData = [];
    let cellSize = getCellSize(room.board.width);
    for (let y = 0, i = 0; y < room.board.height ; y++) {
      let row = [];
      for (let x = 0; x < room.board.width; x++) {
        let cell = room.partition[i];
        cell.size = cellSize;
        row.push(cell);
        i++;
      }
      boardData.push(row);
    }

    debug("Updating board");

    return boardData;
  }
});

Template.controls.helpers({
  players: function() {
    return this.room.players;
  },
  playButtonIcon: function() {
    return (Session.get('playing') === true ? 'pause' : 'play');
  }
});

// Focus on login field when template is rendered
Template.login.rendered = function() {
  if(!this._rendered) {
    this._rendered = true;
    $('#username').focus();
  }
}

Template.login.events({
  'submit #login-form': event => {
    event.preventDefault();
    Meteor.call('guestLogin', event.target.name.value);
    return false;
  }
});

// Stop playing if mouse button is release outside of board
Template.body.events({
  'mouseup': function(event, template) {
    if (typeof instrument !== "undefined") {
      instrument.stopPlayingNote();
    }
  }
});

Template.roomPlay.events({

  // Play note on mouse down if playback is off
  'mousedown td': function(event, template) {
    let target = $(event.target);

    // Play note if board is not currently playing
    if (Session.get("playing") == false && !target.hasClass('active')) {
      instrument.startPlayingNote(target.data('frequency'));
    }
  },

  // Play note on mouse down if playback is off & mouse button is pressed
  'mouseover td': function(event, template) {
    let target = $(event.target);

    // Play note if board is not currently playing
    if (Session.get("playing") == false && !target.hasClass('active') && event.buttons == 1) {
      instrument.startPlayingNote(target.data('frequency'));
    }
  },

  // Stop playing note if mouse button is released
  'mouseup': function() {
    window.instrument.stopPlayingNote();
  },

  // Add note to the board when mouse button is released
  'mouseup td': function (event, template) {
    let target = $(event.target),
      slot = $('player_'+Meteor.userId()).data('slot'),
      cell = { id: target.data('id') };

    if (target.hasClass('active')) {
      // target.removeClass("active"); // optimistic ui
      cell.active = false;
    } else {
      cell.slot = $('.user_'+Meteor.userId()).data('slot');
      cell.active = true;
      // target.addClass("active player_"+cell.slot); // optimistic ui
    }

    debug("Updating cell "+cell.id);
    Meteor.call('updateCell', cell, function(error, result) {
      if (error) {
        toastr.error(TAPi18n.__(error.reason));
      }
    });
  },
});

Template.roomWatch.events({
  'click #board': function() {
    toastr.warning(TAPi18n.__("cannot-add-notes-watch-mode"));
  }
});

Template.controls.events({
  'click #play': function (event, template) {
    window.togglePlay(this.room);
    window.instrument.playNote(1); // Hack to fix sound in Safari iOS
  }
});

Template.notifications.helpers({
  notifications: function() {
    let room = Session.get('currentRoom');
    if (!room) {
      return [];
    }
    return Polytunes.Notifications.find({ roomId: room._id, timestamp: { $gte: (new Date()).getTime() - 2700 } }).fetch();
  }
});

Template.notification.onCreated(function() {
  let notification = this.data;

  window.instrument.playNote(780);
  setTimeout( function() { window.instrument.playNote(520); }, 150);

  setTimeout( function() {
    $("#notification_"+notification._id).fadeOut();
  }, 2700);
});

window.togglePlay = (function() {
  let handler = -1;
  return function() {
    if (handler === -1) {
      Session.set("playing", true);
      handler = setInterval(function () {
        play();
      }, noteDuration());
    } else {
      Session.set("playing", false);
      cursor = 0;
      clearInterval(handler);
      handler = -1;
    }
  }
})();

function play() {

  let room = Session.get('currentRoom');

  if (cursor >= room.board.width) {
    cursor = 0;
  }

  for(let y = 0; y < room.board.height; y++) {
    let cell = boardData[y][cursor];
    if (cell.active) {
      let $cell = $(`td[data-id="{${cursor};${y}}"]`);
      instrument.playNote(cell.frequency);
      visualEffect($cell, cursor, y);
    }
  }

  cursor++;
}

var visualEffect = function($cell, x, y) {

    var around = $(`td[data-id="{${x-1};${y}}"],
      td[data-id="{${x+1};${y}}"],
      td[data-id="{${x};${y-1}}"],
      td[data-id="{${x};${y+1}}"]`);

    // Main cell effect
    $cell.addClass('playing');
    // around.addClass('around');

    setTimeout( function() {
      $cell.removeClass('playing');
      around.removeClass('around');
    }, noteDuration() * 2);

	}

var noteDuration = function() {
  return 60 / Session.get('currentRoom').tempo * 1000 / 4;
};

var cursor = 0;

var getCellSize = function(boardSize) {
  let windowWidth = $(window).width(),
    boardWidth = windowWidth,
    cellWidth = 0,
    borderSpacing = 5;

  if (boardWidth > 500) {
    boardWidth = 500;
    borderSpacing = 5;
  }

  return Math.floor((boardWidth - (borderSpacing * (boardSize + 2))) / boardSize);
}
