/*
    Copyright (C) 2018 Bruno Spyckerelle

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

/*
 * Mattermost Chat - JQuery UI Widget
 *
 * Usage :
 * $('element').mattermostchat({
 *      baseurl: "base url",
 *      channelId: "[optional] default channelId",
 *      teamName : "Name of the team"
 *      userName: "Login to use"
 * });
 *
 * @author Bruno Spyckerelle
 */

(function ($, undefined) {

    $.widget("dsna.mattermost", {
        /**
         *
         * @memberOf $
         */
        version: "0.0.3",

        //default options
        options: {
            baseUrl: "",
            userName: "",
            teamName: "",
            channelId: ""
        },
        currentChannelId: "",
        currentChannelName: "",
        //Initialize the timeline
        _create: function () {
            var self = this;
            //register events
            this.element.on('click', '.heading-compose', function(){
                $(".side-two").css({
                    "left": "0"
                });
                self.element.find('.compose-sideBar').empty();
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostChat/getMyChannels?teamid='+self.options.teamName, function(data){
                    for(var i in data){
                        self._addGroup(data[i]);
                    }
                });
            });
            this.element.on('click', '.groups-back', function(){
                $(".side-two").css({
                    "left": "-100%"
                });
            });
            this.element.on('click', '.heading-name-meta', function(){
                if(self.element.find('.side').is(':visible')) {
                    self.element.find('.side').hide();
                    var container = self.element.find('.container');
                    if(window.outerWidth >= 768) {
                        var newWidth = container.outerWidth() * 0.66;
                        container.css('width', newWidth+'px');
                    }
                    self.element.find('.conversation').removeClass('col-sm-8').addClass('col-sm-12');
                } else {
                    self.element.find('.side').show();
                    var container = self.element.find('.container');
                    if(window.outerWidth >= 768) {
                        var newWidth = container.outerWidth() / 0.66;
                        container.css('width', newWidth+'px');
                    }
                    self.element.find('.conversation').addClass('col-sm-8').removeClass('col-sm-12');
                }
            });
            this.element.find('.heading-name-meta').trigger('click');

            this.element.on('submit',' #send-form', function(e){
                e.preventDefault();
                $.post(self.options.baseUrl+'/mattermost/mattermostchat/sendMessage?channelid='+self.currentChannelId, $("#send-form").serialize(), function(data){
                    if(data['messages']){
                        displayMessages(data.messages);
                    }
                    if(data['success']){
                        console.log('test')
                    }
                }, 'json').fail(function(){
                    var messages = '({error: ["Impossible d\'enregistrer l\'organisation."]})';
                    displayMessages(eval(messages));
                });

            });

            //on change chat
            this.element.on('click', '.group', function(event){
                var me = $(this);
                if(me.data('id').localeCompare(self.currentChannelId) !== 0) {
                    self.element.find('.groups-back').trigger('click');
                    self.changeChannel(me.data('id'), me.data('name'));
                }
            });

            //reduce chat
            this.element.on('click', '#reduce-chat', function(event){
                self.element.find('.app').addClass('reduce');
                self.element.find('.app-one').hide();
                self.element.find('.chat-reduce').show();
            });

            //show chat
            this.element.on('click', '.chat-reduce', function(event){
                self.element.find('.app').removeClass('reduce');
                self.element.find('.app-one').show();
                self.element.find('.chat-reduce').hide();
            });

            //resize textarea if multiline
            this.element
                .one('focus.autoExpand', 'textarea.autoExpand', function(){
                    var savedValue = this.value;
                    this.value = '';
                    this.baseScrollHeight = this.scrollHeight;
                    this.value = savedValue;
                 })
                .on('input.autoExpand', 'textarea.autoExpand', function(){
                    var minRows = this.getAttribute('data-min-rows')|0, rows;
                    this.rows = minRows;
                    rows = Math.ceil((this.scrollHeight - this.baseScrollHeight) / 23);
                    this.rows = minRows + rows;
                    self.element.find('#conversation').css('height',395-22.85*rows+'px');
                    self.element.find('.reply').css('height', 60+22.85*rows+'px');
                });

            //submit on enter and newline on shift+enter
            this.element.find('#comment').keypress(function(e){
                if(e.which == 13) {
                    if(e.shiftKey) {
                        $('#comment').append($("#comment").val()+"<br />");
                    } else {
                        e.preventDefault();
                        $("#send-form").submit();
                    }
                }
            });

            //initialize chat
            $.when(
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getDefaultChannelId?teamid=' + self.options.teamName, function (data) {
                    self.currentChannelId = data.channelid;
                })
            ).then(function(){
                if(self.options.channelId.localeCompare("") !== 0) {
                    self.currentChannelId = self.options.channelId;
                }
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostchat/getchannelname?channelid='+self.currentChannelId, function(data){
                    self.element.find('span.channel-name').text(data.channelname);
                    self.currentChannelName = data.channelname;
                });
                self.changeChannel(self.currentChannelId, self.currentChannelName);
            });


            //add loaders
            $(document)
                .ajaxSend(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1) {
                        $('#conversation').addClass('load');
                    }
                    if(settings.url.indexOf('sendMessage') > -1) {
                        $("#comment").addClass('reply-loader');
                    }
                    if(settings.url.indexOf('getChannelMembers') > -1) {
                        $(".sideBar").addClass('load');
                    }
                    if(settings.url.indexOf('getMyChannels') > -1) {
                        $(".compose-sideBar").addClass('load');
                    }
                })
                .ajaxComplete(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1) {
                        $('#conversation').removeClass('load');
                    }
                    if(settings.url.indexOf('getChannelMembers') > -1) {
                        $(".sideBar").removeClass('load');
                    }
                    if(settings.url.indexOf('getMyChannels') > -1) {
                        $(".compose-sideBar").removeClass('load');
                    }
                    if(settings.url.indexOf('sendMessage') > -1) {
                        $("#comment").removeClass('reply-loader');
                        jqxhr
                            .done(function(){
                                $("#comment").val('');
                                self._refresh();
                            })
                            .fail(function(){
                                //TODO add alert
                            });
                    }
                });
        },

        /* Public methods */

        changeChannel : function(channelId, channelName) {
            var self = this;
            //empty sideBar and conversation
            this.element.find('.sideBar ul').empty();
            this.element.find('.message-previous').nextAll().remove();
            this.element.find('.channel-name').text(channelName);
            self.currentChannelId = channelId;
            $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getLastPosts?channelid='+self.currentChannelId, function(data){
                self._addPosts(data);
            });
            //fetch members
            $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getChannelMembers?channelid='+self.currentChannelId, function(data){
                self._addUsers(data);
            });
        },
        /* Private Methods */
        _addPosts: function(data) {
            var posts = [];
            for(var i in data)
            {
                posts.push(data[i]);
            }
            posts.sort(function(a,b){return b.order - a.order});
            var numberPosts = posts.length;
            //insert each post
            for (var i = 0; i < numberPosts; i++) {
                this._addPost(posts[i]);
            }
            var container = this.element.find('#conversation');
            //go to the last message
            container.scrollTop(container[0].scrollHeight);
        },
        _addPost : function(data) {
            if(this.options.userName.localeCompare(data.username) == 0) {
                this._addMyPost(data);
            } else {
                this._addOtherPost(data);
            }
        },
        _addMyPost: function(data) {
            var date = moment(data.lastupdate);
            var dateString = date.format("ddd h:mm");
            var post = $('<div class="row message-body"  data-id="'+data.id+'">' +
                '<div class="col-sm-12 message-main-receiver">' +
                '<div class="receiver">' +
                '<div class="message-text">' +
                data.message +
                '</div>' +
                '<span class="message-time pull-right">' +
                dateString+
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>');
            $("#conversation").append(post);
        },
        _addOtherPost: function(data) {
            var date = moment(data.lastupdate);
            var dateString = date.format("ddd h:mm");
            var post = $('<div class="row message-body" data-id="'+data.id+'">' +
                '<div class="col-sm-12 message-main-sender">' +
                '<div class="sender">' +
                '<div class="message-text">' +
                data.message +
                '</div>' +
                '<span class="message-time pull-right">' +
                data.username + ', ' + dateString+
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>');
            $("#conversation").append(post);
        },
        _addUsers: function(data){
            var self = this;
            var options = {
                valueNames: [
                    'name',
                    'lastseen',
                    'initials'
                ],
                item: '<li class="list-inline"><div class="row sideBar-body">'+
                '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                '<div class="heading-avatar-circle">'+
                '<span class="heading-avatar-initials initials"></span>' +
                '</div>'+
                '</div>'+
                '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                '<div class="row">'+
                '<div class="col-sm-8 col-xs-8 sideBar-name name">'+
                '<span class="name-meta">'+
                '</span>'+
                '</div>'+
                '<div class="col-sm-4 col-xs-4 pull-right sideBar-time">'+
                '<span class="time-meta pull-right lastseen">'+
                '</span>'+
                '</div>'+
                '</div>'+
                '</div>'+
                '</div></li>'
            };
            var values = [];
            for(var i in data){
                var date = moment(data[i].lastviewedat);
                var dateString = date.format("ddd h:mm");
                var value = {
                    name: data[i].username,
                    lastseen: dateString,
                    initials: data[i].username.charAt(0).toUpperCase()
                };
                values.push(value);
            };
            var userList = new List('users', options, values);
            this.element.find('.heading-avatar-circle').each(function(index){
                var color = self._getRandomColor();
                var textColor = self._textColor(self._hex2rgb(color));
                $(this).css('background-color', color);
                $(this).find('.heading-avatar-initials').css('color', textColor);
            });
        },
        _addGroup: function(data) {
            var firstLetter = data.name.charAt(0).toUpperCase();
            var color = this._getRandomColor();
            var textColor = this._textColor(this._hex2rgb(color));
            var team = $(
                '<div class="row sideBar-body group" data-id="'+data.id+'" data-name="'+data.name+'">'+
                    '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                        '<div class="heading-avatar-circle" style="background-color: '+color+'">'+
                            '<span class="heading-avatar-initials" style="color: '+textColor+'">'+firstLetter+'</span>' +
                        '</div>'+
                    '</div>'+
                    '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                        '<div class="row">'+
                            '<div class="col-sm-8 col-xs-8 sideBar-name">'+
                                '<span class="name-meta">'+data.name+
                                '</span>'+
                            '</div>'+
                            '<div class="col-sm-4 col-xs-4 pull-right sideBar-time">'+
                            '</div>'+
                        '</div>'+
                    '</div>'+
                '</div>');
            if(this.currentChannelId.localeCompare(data.id) == 0) {
                team.find('.sideBar-time').append('<i class="fa fa-check fa-2x"></i>');
            }
            this.element.find('.compose-sideBar').append(team);
        },
        _refresh: function() {
            var lastid = $(".message-body").last().data('id');
            var self = this;
            $.getJSON(this.options.baseUrl+'/mattermost/mattermostchat/getLastPosts?lastid='+lastid+'&channelid='+self.currentChannelId, function(data){
                self._addPosts(data);
            });
        },
        /** Utilitary methods */
        _yiq: function(rgb) {
            return 1 - (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114)/255;
        },
        _textColor: function(rgb) {
            if(this._yiq(rgb) < 0.5) {
                return "#000";
            } else {
                return "#fff";
            }
        },
        _getRandomColor: function() {
            var letters = '0123456789ABCDEF';
            var color = '#';
            for (var i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        },
        _hexdec: function(hexString){
            hexString = (hexString + '').replace(/[^a-f0-9]/gi, '');
            return parseInt(hexString, 16);
        },
        _hex2rgb: function(color) {
            var hex = color.replace("#", "");

            if(hex.length == 3) {
                var r = this._hexdec(hex.substr(0,1).substr(0,1));
                var g = this._hexdec(hex.substr(1,1).substr(1,1));
                var b = this._hexdec(hex.substr(2,1).substr(2,1));
            } else {
                var r = this._hexdec(hex.substr(0,2));
                var g = this._hexdec(hex.substr(2,2));
                var b = this._hexdec(hex.substr(4,2));
            }
            return [r, g, b];
        },
    });
})(jQuery);