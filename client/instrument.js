"use strict";

window.Instrument = class Instrument {

  getWad() {
    var settings = {
      volume: .1,
      source: 'sine',
    };
    return new Wad(settings);
  }

  getNoteDuration() {
    if (this.duration) {
      return this.duration;
    } else {
      let room = Session.get('currentRoom');
      if (room) {
        this.duration = 60 / room.tempo * 1000 / 4;
        return this.duration;
      }
    }
    return 0;
  }

  playNote(frequency) {
    var wad = this.getWad(),
      duration = this.getNoteDuration();
    wad.play({
      pitch: frequency,
      env : {
        decay: duration / 1000 * .1,
        hold: duration / 1000 * 1.1,
        release: duration / 1000 * .75,
      },
      reverb: {
        wet: 0,
      }
    });
  }

  startPlayingNote(frequency) {
    var duration = this.getNoteDuration();
    this.stopPlayingNote();
    this.currentWad = this.getWad().play({
      pitch: frequency,
      env: {
        decay: duration / 1000 * .1,
        release: duration / 1000 * .75
      }
    });
  }

  stopPlayingNote() {
    if (typeof this.currentWad === "undefined") {
      return;
    }
    this.currentWad.stop();
    this.currentWad = undefined;
  }

}
