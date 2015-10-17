Router.configure({
  layoutTemplate: 'layout',
  loadingTemplate: 'loading',
  notFoundTemplate: 'notFound',
  waitOn: function() { return Meteor.subscribe('rooms'); }
});

Router.route('/', { 
  name: 'home'
});

Router.route('/room/:_id', {
  name: 'roomPlay',
  data: function() { return Rooms.findOne(this.params._id); }
});