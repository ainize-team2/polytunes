"use strict";

const colors = [ "#AD87FF", "#D7E131", "#D15BB0", "#03A5C4", "#FBB43D", "#41DD92" ];
const NUM_COLORS = 6;

Meteor.methods({
	createRoom: (room) => {
		room = new Polytunes.Room(room, false);
    return Polytunes.Rooms.insert(room);
	},

	updateCell: (cell) => {
    "use strict";

    let room = Polytunes.Rooms.findOne(Meteor.user().currentRoom),
      user = Meteor.user();

    // Get cell coordinates
    let coord = cell.id.match(/{(\d+);(\d+)}/);
    cell.x = coord[1];
    cell.y = coord[2];
    // console.log(cell);

    // Check if user can update this side of the board
    if ((cell.slot == 0 && cell.x > (room.board.width / 2) - 1) ||
          (cell.slot == 1 && cell.x < room.board.width / 2)
      ) {
      throw new Meteor.Error(500, `cannot-add-notes-on-this-side`);
    }

    let result = Polytunes.Rooms.update(
  		{	_id: user.currentRoom,
  			'partition.id': cell.id
		  },
      { $set: {
        'partition.$.active': cell.active,
        'partition.$.slot': cell.slot,
        'partition.$.updatedBy': user._id,
        'partition.$.color': cell.color
      } }
		);
    if (!result) {
      throw new Meteor.Error(500, `An error occured while updating cell ${cell.id}`);
    }
  },

	guestLogin: function(name) {
		let user = Meteor.user();
    Meteor.users.update(user, {
      $set: {
        'profile.name': name,
        'profile.online': true,
        lastSeenAt: (new Date()).getTime(),
      }
    });
    console.log(`User ${name} logged in.`);
	},

  userJoinsRoom: function(roomId) {
    let user = Meteor.user(),
      room = Polytunes.Rooms.findOne(roomId);

    // Don't join if user is not logged
    if (!user.profile.name) {
      return false;
    }

    // Update user current room
    Meteor.users.update(user, { $set: { 'currentRoom': roomId } });

    if (!isPlayer(room.players, user._id)) {
      // Remove player before inserting
      Polytunes.Rooms.update(room._id, { $pull: { players: { userId: user._id }, multi: true } });

      const other = Polytunes.Rooms.findOne(room._id).players;
      const available = other && other.length ?
        _.filter(colors, col => col !== other[0].color) : colors;
      const myColor = available[Math.floor(Math.random() * available.length)];

      const currentPlayer = other && other.length ? other[0] : null;
      const nextPlayer = {
        userId: user._id,
        name: user.profile.name,
        slot: currentPlayer && currentPlayer.slot === 0 ? 1 : 0,
        color: myColor
      };

      const players = [];
      if (currentPlayer && currentPlayer.slot === 0) {
        players.push(currentPlayer);
        players.push(nextPlayer);
      } else if (!currentPlayer || currentPlayer.slot === 1) {
        players.push(nextPlayer);
        if (currentPlayer) players.push(currentPlayer);
      } else {
        console.log(`Current player has an invalid slot value: ${JSON.stringify(currentPlayer)}`);
        return;
      }

      // Insert player
      Polytunes.Rooms.update(room._id, {
        $set: {
          players: players
        }
      });
      Polytunes.createNotification(room._id, `user-joined-the-room`, { user_name: user.profile.name }, { withSound: true });

      console.log(`User ${user.profile.name} joined room ${roomId}.`);
    }
  },

  userLeavesRoom: function(roomId, user) {
    user = user || Meteor.user();
    let room = Polytunes.Rooms.findOne(roomId);

    if (!user || !room || !user.profile.name) {
      return false;
    }

    let notes = room.partition;

    Meteor.users.update(user, { $unset: { 'currentRoom': "" } });

    // Clear notes created by this user
    for (let i = 0, c = notes.length; i < c; i++) {
      if (notes[i].updatedBy == user._id) {
        notes[i].active = false;
        notes[i].slot = null;
        notes[i].updatedBy = null;
        notes[i].color = "#FFFFFF";
      }
    }

    Polytunes.Rooms.update(roomId, {
      $pull: {
        players: { userId: user._id },
        multi: true
      },
      $set: {
        partition: notes
      }
    });

    room = Polytunes.Rooms.findOne(roomId);

    if (!room || !room.observers || !room.players) {
      return;
    }

    if (room.observers.length > 0 && room.players.length < 2) {
      const currentPlayer = room.players.length ? room.players[0] : null;
      const observer = room.observers[0];
      const available = currentPlayer ? _.filter(colors, col => col !== currentPlayer.color) : colors;
      const myColor = available[Math.floor(Math.random() * available.length)];
      const nextPlayer = {
        userId: observer.userId,
        name: observer.name,
        slot: currentPlayer && currentPlayer.slot === 0 ? 1 : 0,
        color: myColor
      };
      const players = [];
      if (currentPlayer && currentPlayer.slot === 0) {
        players.push(currentPlayer);
        players.push(nextPlayer);
      } else if (!currentPlayer || currentPlayer.slot === 1) {
        players.push(nextPlayer);
        if (currentPlayer) players.push(currentPlayer);
      } else {
        console.log(`Current player has an invalid slot value: ${JSON.stringify(currentPlayer)}`);
        return;
      }

      Polytunes.Rooms.update(roomId, {
        $set: {
          players: players
        },
        $pull: {
          observers: { userId: nextPlayer.userId },
          multi: true
        }
      });
      console.log(`User ${nextPlayer.name} became the next player`);
    }

    Polytunes.createNotification(room._id, "user-left-the-room", { user_name: user.profile.name }, { withSound: false });

    console.log(`User ${user.profile.name} left room ${roomId}.`);
  },

  observerJoinsRoom: function(roomId) {
    let user = Meteor.user(),
      room = Polytunes.Rooms.findOne(roomId);

    // Don't join if user is not logged
    if (!user.profile.name) {
      return false;
    }
    
    // Remove observer before inserting
    Polytunes.Rooms.update(room._id, { $pull: { observers: { userId: user._id }, multi: true } });

    // Insert observer
    Polytunes.Rooms.update(room._id, {
      $push: {
        observers: {
          userId: user._id,
          name: user.profile.name
        }
      }
    });

    // Polytunes.createNotification(room._id, `user-joined-the-room`, { user_name: user.profile.name }, { withSound: true });

    console.log(`User ${user.profile.name} joined room ${roomId} as audience.`);
  },

  observerLeavesRoom: function(roomId) {
    let user = Meteor.user();

    Polytunes.Rooms.update(roomId, {
      $pull: {
        observers: { userId: user._id },
        multi: true
      }
    });
  }
});

function isPlayer(players, user) {
  if (!players || !players.length) return false;
  return players.filter(item => item.userId === user).length;
}