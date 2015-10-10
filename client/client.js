Template.body.helpers({
    isLogged: ()=> !Session.get('authorization') ? false : true
})

let boardData;

Template.board.helpers({
  rows: function () {
    let room = Rooms.findOne();

    if (!room)
      return false;

    if (!boardData) {
      boardData = [];
      for (let i = 0; i < room.board.width; i++) {
        let row = [];
        for (let j = 0; j < room.board.height ; j++) {
          row.push(cell(i, j));
        }
        boardData.push(row)
      }
    }

    room.partition.forEach(function (cell) {
      boardData[cell.x][cell.y] = cell;
    });

    console.log('row helper', boardData);

    return boardData;
  },
});

Template.login.events({
  'submit #login-form': event => {
    event.preventDefault();

    const surname = event.target.surname.value;
    const color = event.target.color.value;
    const roomId = Rooms.findOne()._id;

    Meteor.call('addUser', roomId, { surname, color});
    Session.setPersistent('authorization', "true");
    return false;
  }
});

Template.board.events({
  'click td': function (event, template) {
    let x = $(event.target).data('x');
    let y = $(event.target).data('y');

    let room = Rooms.findOne();
    boardData[x][y].i = !boardData[x][y].i;

    Meteor.call('addNote', room._id, boardData[x][y]);

    console.log('r', room);
  },
});

Template.controls.events({
  'click #play': function (event, template) {
    togglePlay();
  }
});

Meteor.startup( function() {
  var Instrument = function() {
  }

  Instrument.prototype = {
    getWad: function() {
      return new Wad({source : 'sine'});
    },
    playNote: function(frequency) {
      var wad = this.getWad()
      var duration = noteDuration()
      wad.play({
        pitch : frequency,  // A4 is 440 hertz.
        env : {
          decay: duration / 1000 * .1,
          hold: duration / 1000 * 1.1,
          release: duration / 1000 * .75
        },
        reverb: {
          wet: 1
        }
      });
    }
  }

  instrument = new Instrument();
});

function cell(x, y, userId) {
  return {
    x: x || 0,
    y: y || 0,
    frequency: 200,
    title: 200,
    timestamp: new Date(),
    userId: userId || '',
    i: false,
  }
}

let togglePlay = (function() {
  let handler = -1;
  return function() {
    if (handler === -1) {
      handler = setInterval(function () {
        play();
      }, noteDuration());
    } else {
      clearInterval(handler);
      handler = -1;
    }
  }
})();

function play () {
  let room = Rooms.findOne();

  if (cursor >= room.board.width) {
    cursor = 0;
  }

  $('td').removeClass('p p1 p2');
  for(let y = 0; y < room.board.height; y++) {
    let cell = boardData[y][cursor];
    if (cell.i) {
      $(`td[data-x="${y}"][data-y="${cursor}"]`).toggleClass('p');
      // cell.p = true;
      // visualEffect(cell);
      instrument.playNote(cell.frequency);
    }
  }

  cursor++;
}

function noteDuration() {
  return 60 / Rooms.findOne().tempo * 1000 / 4;
}

var cursor = 0;
