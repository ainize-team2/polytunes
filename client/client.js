"use strict";

const colors = [ "#AD87FF", "#D7E131", "#D15BB0", "#03A5C4", "#FBB43D", "#41DD92" ];
const NUM_COLORS = 6;

function debug(msg) {
  if (Session.get('debug') === true) {
    console.log(msg);
  }
}

Meteor.startup( function() {
  if (Meteor.isClient) {
    // Router.plugin("reywood:iron-router-ga");
  }

  Session.set("playing", false);
  window.instrument = new Instrument();
  Meteor.call('userPings');

  // Set language
  const lang = navigator.language || navigator.userLanguage;
  TAPi18n.setLanguage(lang.substring(0,2));

  // Notification options
  toastr.options = {
    positionClass: "toast-bottom-left",
    preventDuplicates: true
  }
});

Template.home.helpers({
  rooms: function() {
    return Polytunes.Rooms.find({ isPublic: true });
  },
  numLivePlays: function() {
    return Polytunes.Rooms.find().count();
  }
});

Template.layout.events({
  'click #ainize-btn': function(event) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "poweredby_click");
    }
  },
  'click #github-btn': function(event) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "github_click");
    }
  },
})

Template.about.events({
  'click #ainize-btn': function(event) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "poweredby_click");
    }
  },
  'click #github-btn': function(event) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "github_click");
    }
  },
  'click #stack-btn': function(event) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "stackoverflow_click");
    }
  }
})

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

Template.waitingPrivate.helpers({
  currentUrl: function() {
    return window.location.href;
  }
});

Template.share.helpers({
  currentUrl: function() {
    return window.location.href;
  }
});

// Init clipboard with event delegation (only on parent)
Template.share.onRendered(function () {
  this.clipboard = new Clipboard('.clipboard');
  this.clipboard.on('success', (e) => {
    toastr.success(TAPi18n.__('copied'));
  });
});

Template.share.onDestroyed(function () {
  if (this.clipboard) this.clipboard.destroy();
});

Template.share.events({
  'click button': function (event, template) {
    if (Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "share_button_click");
    }
  }
});

Template.roomPlay.onCreated(function() {
  let room = this.data.room,
    user = Meteor.user();

  if (!user.profile.name) {
    Router.go("login", { roomId: room._id });
  } else if (isPlayer(room.players, user._id) || room.players.length < 2) {
    Session.set("currentRoom", room);
    Meteor.call("userJoinsRoom", room._id);
  } else {
    toastr.info(TAPi18n.__('room-full-watch-mode'));
    Router.go("roomWatch", { _id: room._id });
    return;
  }
  const cb = (event) => {
    window.removeEventListener('popstate', cb);
    Router.go("home");
  }
  window.addEventListener('popstate', cb, false);
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
  let room = this.data.room,
    user = Meteor.user();

  if (!user.profile.name) {
    Router.go("login", { roomId: room._id });
  } else {
    Session.set("currentRoom", room);
    Meteor.call("observerJoinsRoom", room._id);

    const cursor = Polytunes.Rooms.find(room._id, { fields: { players: 1 } });
    const handle = cursor.observeChanges({
      changed: function(id, fields) {
        if (!fields.players) {
          return;
        }
        if (isPlayer(fields.players, user._id)) {
          handle.stop();
          Router.go("roomPlay", { "_id": room._id });
        }
      }
    });
  }
});

Template.roomWatch.onDestroyed(function() {
  let room = this.data.room;
  Meteor.call("observerLeavesRoom", room._id);
  if (Session.get("playing")) {
    window.togglePlay();
  }

  Session.set("currentRoom", null);
})

function isPlayer(players, user) {
  if (!players || !players.length) return false;
  return players.filter(item => item.userId === user).length;
}

Template.solo.onCreated(function() {
  let room = this.data.room;
  Session.set("currentRoom", room);
  Session.set("currentColor", colors[Math.floor(Math.random() * NUM_COLORS)]); 
});

Template.solo.onDestroyed(function() {
  if (Session.get("playing")) {
    window.togglePlay();
  }
  Session.set("currentRoom", null);
  Session.set("currentColor", null); 
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

Template.playerNames.helpers({
  players: function() {
    return this.room.players;
  },
  isMe: function(userId) {
    return Meteor.user()._id === userId ? "(you)" : "";
  }
});
Template.playerColors.helpers({
  players: function() {
    return this.room.players;
  }
});
Template.controls.helpers({
  playButtonIcon: function() {
    return (Session.get('playing') === true ? 'pause' : 'play');
  },
  numObservers: function() {
    return this.room.observers ? this.room.observers.length : 0;
  },
  isSolo: function() {
    return this.room.isSolo;
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
  'submit #login-form': function(event) {
    event.preventDefault();
    const params = Router.current().params;
    Meteor.call('guestLogin', event.target.name.value, (error, result) => {
      Router.go('roomPlay', { _id: params.roomId });
    });
    return false;
  },
  'keyup #username': function(event) {
    if(document.getElementById("username").value === "") { 
      document.getElementById("username-btn").disabled = true; 
    } else {
      document.getElementById("username-btn").disabled = false; 
    }
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

Template.board.events({
  // Play note on mouse down if playback is off
  'mousedown td': function(event, template) {
    let target = $(event.target);
    const room = Session.get("currentRoom");

    if (target.hasClass('active')) {
      if (room && room.isSolo) {
        target.css("background", "#FFFFFF");
      }
    } else {
      // Play note if board is not currently playing
      if (Session.get("playing") == false ) {
        instrument.startPlayingNote(target.data('frequency'));
      }
      if (room && room.isSolo) {
        const color = Session.get("currentColor"); 
        target.css("background", color);
      }
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
});

// Room in play mode
Template.roomPlay.events({

  // Add note to the board when mouse button is released
  'mouseup td': function (event, template) {
    // console.log("mouse upppppp", Session.get("currentRoom"))
    let target = $(event.target),
      cell = {
        id: target.data('id'),
        slot: $('.user_'+Meteor.userId()).data('slot'),
      };

    if (cell.slot === undefined) {
      console.log("invalid cell:", cell);
      return;
    }

    if (target.hasClass('active')) {
      cell.active = false;
      cell.color = "#FFFFFF";
    } else {
      const room = Polytunes.Rooms.findOne(Session.get("currentRoom")._id); 
      const player = _.find(room.players, player => player.slot === cell.slot);
      console.log("meteor room:", room);
      console.log("player:", player);
      console.log("cell:", cell);
      cell.active = true;
      cell.color = player ? player.color : "#FFFFFF";
    }

    debug("Updating cell "+cell.id);
    Meteor.call('updateCell', cell, function(error, result) {
      if (error) {
        const popup = $(".popup");
        if (popup) {
          $(".popup > div").html(TAPi18n.__(error.reason));
          popup.css("display", "flex");
          setTimeout(() => {
            popup.css("display", "none");
          }, 3000);
        }
      }
    });
  }
})


// Room in solo mode
Template.solo.events({
  // Activate cell without sending note to the server
  'mouseup td': function(event, template) {
    const target = $(event.target),
      id = target.data('id'),
      coord = id.match(/{(\d+);(\d+)}/),
      x = coord[1],
      y = coord[2];
    if (target.hasClass('active')) {
      boardData[y][x].active = false;
      target.removeClass("active player_0");
    } else {
      boardData[y][x].active = true;
      target.addClass("active player_0");
    }
  }
})

Template.roomWatch.events({
  'click #board': function() {
    toastr.warning(TAPi18n.__("cannot-add-notes-watch-mode"));
  }
});

Template.controls.events({
  'click #play': function (event, template) {
    if (!Session.get("playing") && Meteor.settings.public.env.prod) {
      ga("send", "event", "spotainize_common", "play_button_click");
    }
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

  if (notification.options.withSound) {
    window.instrument.playNote(780);
    setTimeout( function() { window.instrument.playNote(520); }, 150);
  }

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
    boardWidth = windowWidth - 10,
    cellWidth = 0,
    borderSpacing = 5;

  if (boardWidth > 500) {
    boardWidth = 500;
    borderSpacing = 5;
  }

  return Math.floor((boardWidth - (borderSpacing * (boardSize + 2))) / boardSize);
}

UI.registerHelper('t', function(key, options) {
  return TAPi18n.__(key, options);
});
