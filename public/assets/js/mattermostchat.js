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
 *      token: "Authentication token, mandatory to activate websockets
 *      serverUrl : "the url of the webserver, without protocol",
 *      minimized : "Starts minimized, default : false",
 *      acknowledgement: "Add button to acknowledge a message, default : false"
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
        version: "0.1.0",

        //default options
        options: {
            baseUrl: "",
            userName: "",
            teamName: "",
            channelId: "",
            token: "",
            serverUrl:"",
            minimized: false,
            acknowledgement: false
        },
        currentChannelId: "",
        currentChannelName: "",
        /**
         * Websocket connection
         */
        conn: null,
        connFailCount: 0,
        //timer
        timer: null,
        //lastupdate in UNIX timestamp
        lastupdate: 0,
        /**
         * True if scroll by user
         */
        userScroll: false,
        sequence: 1,
        responseCallbacks: [],
        //Initialize the widget
        _create: function () {
            var self = this;

            //register events
            this.element.on('click', '.heading-groups', function(){
                $(".side-two").css({
                    "left": "0"
                });
                self.element.find('.compose-sideBar ul').empty();
                $.getJSON(self.options.baseUrl + '/mattermost/mattermostChat/getMyChannels?teamid='+self.options.teamName, function(data){
                    self._addGroups(data);
                });
            });
            this.element.on('click', '.groups-back', function(){
                $(".side-two").css({
                    "left": "-100%"
                });
            });
            this.element.on('click', '.heading-name-meta, .heading-close', function(){
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
            if(this.options.minimized) {
                self.element.find('.app').addClass('reduce');
                self.element.find('.app-one').hide();
                self.element.find('.chat-reduce').show();
            }

            this.element.on('click', '.user', function(e){
                var me = $(this);
                var textarea = self.element.find("#comment");
                textarea.val(textarea.val()+' @'+me.data('name'));
            });

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
                var me = $(this).parent();
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

            //detect scroll
            this.element.find('#conversation').scroll(function(event){
                var container = self.element.find('#conversation')[0];
                if (container.scrollHeight - container.scrollTop === container.clientHeight) {
                    self.userScroll = false;
                } else {
                    self.userScroll = true;
                }
            });

            this.element.on('click', '.ack', function(event){
                var postid = $(this).data('id');
                var me = $(this);
                $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/ack?postid='+postid, function(data){
                    if(self.connFailCount !== 0) {
                        //if no websocket, we rely on status code to know if reaction correctly added
                        if(data.result == 200) {
                            me.addClass('ack-sent').find('span').removeClass('fa-check').addClass('fa-check-square-o');
                        }
                    }
                });
            });

            this.element.on('click', "#previousMessages", function(e){
                var postid = self.element.find("#conversation .message-body").first().data('id');
                $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getLastPosts?channelid='+self.currentChannelId+'&beforeid='+postid, function(data){
                    self._addPosts(data, true);
                });
            });

            if(this.options.acknowledgement) {
                this.element.on({
                    mouseenter: function () {
                        $(this).find('.ack').show();
                    },
                    mouseleave: function () {
                        $(this).find('.ack').hide();
                    }
                }, '.message-main-sender');
            }

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
                    self.changeChannel(self.currentChannelId, self.currentChannelName);
                });
            });


            //add loaders
            $(document)
                .ajaxSend(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1 && settings.url.indexOf('lastupdate') == -1) {
                        $('#conversation').addClass('load');
                    }
                    if(settings.url.indexOf('getChannelMembers') > -1) {
                        $(".sideBar").addClass('load');
                    }
                    if(settings.url.indexOf('getMyChannels') > -1) {
                        $(".compose-sideBar").addClass('load');
                    }
                    if(settings.url.indexOf('sendMessage') > -1) {
                        $("#comment").addClass('reply-loader');
                    }
                })
                .ajaxComplete(function(event, jqxhr, settings){
                    if(settings.url.indexOf('getLastPosts') > -1 && settings.url.indexOf('lastupdate') == -1) {
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
                                if(self.connFailCount !== 0) { //no websocket : force refresh
                                    self._refresh();
                                }
                            })
                            .fail(function(){
                                //TODO add alert
                            });
                    }
                });

            //create websocket connection
            self.conn = new WebSocket("wss://"+self.options.serverUrl+'/api/v4/websocket');
            self.conn.onopen = function(event){
                self._sendWebsocketMessage("authentication_challenge",{"token": self.options.token}, null);
            };
            self.conn.onerror = function(event){
                self.connFailCount = 1;
                //connect to websocket fail -> fallback to long poll
                self.lastupdate = Date.now();
                self.timer = setInterval(function () {
                    self._refresh()
                }, 10000);
            };
            self.conn.onmessage = function(event) {
                //console.log(event);
                var msg = JSON.parse(event.data);
                if(msg.seq_reply) {
                    if(self.responseCallbacks[msg.seq_reply]) {
                        self.responseCallbacks[msg.seq_reply](msg);
                        delete self.responseCallbacks[msg.seq_reply];
                    }
                } else {
                    switch (msg.event) {
                        case "posted":
                            var post = JSON.parse(msg.data.post);
                            post['sender_name'] = msg.data.sender_name;
                            post['message'] = marked(post['message']); //render markdown
                            if (post.channel_id.localeCompare(self.currentChannelId) == 0) {
                                self._addPost(post);
                            }
                            break;
                        case "status_change":
                            var userId = msg.data.user_id;
                            var status = msg.data.status;
                            self._changeStatusByUserId(userId, status);
                            break;
                        case "reaction_added":
                            if(self.options.acknowledgement) {
                                var reaction = JSON.parse(msg.data.reaction);
                                if(reaction.emoji_name.localeCompare("ok") == 0) {
                                    self.element
                                        .find('.ack[data-id="'+reaction.post_id+'"]').addClass('ack-sent')
                                        .find('span').removeClass('fa-check').addClass('fa-check-square-o');
                                }
                            }
                            break;
                    }
                }
            };
        },

        /* Public methods */
        minimize : function() {
            this.element.find('#reduce-chat').trigger('click');
        },
        changeChannel : function(channelId, channelName) {
            var self = this;
            //stop previous refresh
            if(self.timer !== null && self.connFailCount == 0) {
                clearInterval(self.timer);
            }
            //empty sideBar and conversation
            this.element.find('.sideBar ul').empty();
            this.element.find('.message-previous').nextAll().remove();
            this.element.find('.channel-name').text(channelName);
            self.currentChannelId = channelId;
            $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getLastPosts?channelid='+self.currentChannelId, function(data){
                self._addPosts(data);
                if(self.connFailCount !== 0) { //no websocket : start polling
                    //periodic refresh
                    self.lastupdate = Date.now();
                    self.timer = setInterval(function () {
                        self._refresh()
                    }, 10000);
                }
            });
            //fetch members
            $.when(
                $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getChannelMembers?channelid='+self.currentChannelId, function(data){
                    self._addUsers(data);
                })
            ).then(
                function(){
                    if(self.connFailCount > 0) {
                        self._updateStatuses();
                    } else {
                        self._sendGetStatuses();
                    }
                }
            );


        },
        /* Private Methods */
        _addPosts: function(data, reverse) {
            var posts = [];
            for(var i in data)
            {
                var post = data[i];
                if(post.order !== undefined ) {
                    //TODO childs posts out of view have no order
                    posts.push(data[i]);
                }
            }
            if(reverse === undefined){
                posts.sort(function(a,b){return b.order - a.order});
            } else {
                posts.sort(function(a,b){return a.order - b.order});
            }
            var numberPosts = posts.length;
            //insert each post
            for (var i = 0; i < numberPosts; i++) {
                this._addPost(posts[i], reverse);
            }
        },
        _addPost : function(data, reverse) {
            var post = data;
            var messages = $('.message-body').filter(function(){
                return ($(this).data('id').localeCompare(data.id) == 0);
            });
            if(messages.length == 0){
                //no message with same id -> insert
                if(this.options.userName.localeCompare(data.sender_name) == 0) {
                    this._addMyPost(data, reverse);
                } else {
                    this._addOtherPost(data, reverse);
                }
            }
            this._scrollToBottom();
        },
        _addMyPost: function(data, reverse) {
            var date = moment(data.update_at);
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
            if(reverse === undefined){
                $("#conversation").append(post);
            } else {
                post.insertAfter('.message-previous');
            }
        },
        _addOtherPost: function(data, reverse) {
            var date = moment(data.update_at);
            var dateString = date.format("ddd h:mm");
            var postid = data.id;
            var post = $('<div class="row message-body" data-id="'+postid+'">' +
                '<div class="col-sm-12 message-main-sender">' +
                    '<div class="sender">' +
                        '<div class="message-text">' +
                        data.message +
                        '</div>' +
                        '<span class="message-time pull-right">' +
                        data.sender_name + ', ' + dateString+
                        '</span>' +
                    '</div>' +
                '</div>' +
                '</div>');
            if(this.options.acknowledgement == true) {
                $.getJSON(this.options.baseUrl + '/mattermost/MattermostChat/isack?postid=' + postid, function (data) {
                    if (data.ack == true) {
                        post.find('.message-main-sender').append('<div class="ack ack-sent"><span class="fa fa-check-square-o"></span></div>');
                    } else {
                        post.find('.message-main-sender').append('<div class="ack" title="Accuser réception" data-id="'+postid+'"><span class="fa fa-check"></span></div>');
                    }
                });
            }
            if(reverse === undefined) {
                $("#conversation").append(post);
            } else {
                post.insertAfter('.message-previous');
            }
        },
        _addUsers: function(data){
            var self = this;
            var options = {
                valueNames: [
                    'fullname',
                    'lastseen',
                    'initials',
                    {data: ['id', 'name']},
                ],
                item: '<li class="list-inline user"><div class="row sideBar-body">'+
                '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                '<span class="fa user-status user-offline"></span>'+
                '<div class="heading-avatar-circle">'+
                '<span class="heading-avatar-initials initials"></span>' +
                '</div>'+
                '</div>'+
                '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                '<div class="row">'+
                '<div class="col-sm-8 col-xs-8 sideBar-name fullname">'+
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
                var dateString = date.format("ddd D, h:mm");
                var value = {
                    id: data[i].id,
                    fullname: data[i].username,
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
        /**
         * Update statuses via polling
         * Fall back in case websockets are not available
         * @private
         */
        _updateStatuses: function(){
            var self = this;
            $('.user').each(function(index){
                var me = $(this);
                $.getJSON(self.options.baseUrl + '/mattermost/MattermostChat/getUserStatus?userid='+$(this).data('id'), function(data){
                    self._changeStatus(me.find('.user-status'), data.status);
                });
            });
        },
        _changeStatuses: function(data) {
            for(var i in data.data) {
                this._changeStatusByUserId(i, data.data[i]);
            }
        },
        _changeStatusByUserId: function(userId, status) {
            var element = this.element.find('.user[data-id="'+userId+'"] .user-status');
            this._changeStatus(element, status);
        },
        _changeStatus: function(element, status){
            element.removeClass("user-online user-away user-offline user-dnd fa-check fa-clock-o fa-minus");
            switch (status){
                case "online":
                    element.addClass("fa-check user-online");
                    break;
                case "away":
                    element.addClass("fa-clock-o user-away");
                    break;
                case "offline":
                    element.addClass("user-offline");
                    break;
                case "dnd":
                    element.addClass("fa-minus user-dnd");
                    break;
            }
        },
        _addGroups: function(data) {
            var self = this;
            var options = {
                valueNames: [
                    'spanname',
                    'initial',
                    {data: ['id', 'name']},
                ],
                item: '<li class="list-inline">' +
                '<div class="row sideBar-body group">'+
                    '<div class="col-sm-3 col-xs-3 sideBar-avatar">'+
                        '<div class="heading-avatar-circle">'+
                            '<span class="heading-avatar-initials initial"></span>' +
                        '</div>'+
                    '</div>'+
                    '<div class="col-sm-9 col-xs-9 sideBar-main">'+
                        '<div class="row">'+
                            '<div class="col-sm-8 col-xs-8 sideBar-name">'+
                                '<span class="name-meta spanname"></span>'+
                            '</div>'+
                            '<div class="col-sm-4 col-xs-4 pull-right sideBar-time">'+
                            '</div>'+
                        '</div>'+
                    '</div>'+
                '</div></li>'
            };
            var values = [];
            for(var i in data) {
                var value = {
                    spanname: data[i].name,
                    initial: data[i].name.charAt(0).toUpperCase(),
                    id: data[i].id,
                    name: data[i].name
                };
                values.push(value);
            }
            var groupList = new List('groups', options, values);
            this.element.find('.group').each(function(index){
                var color = self._getRandomColor();
                var textColor = self._textColor(self._hex2rgb(color));
                $(this).find('.heading-avatar-circle').css('background-color', color);
                $(this).find('.heading-avatar-initials').css('color', textColor);
                if(self.currentChannelId.localeCompare($(this).parent().data('id')) == 0){
                    $(this).find('.sideBar-time').append('<i class="fa fa-check fa-2x"></i>');
                }
            });
        },
        _refresh: function() {
            var self = this;
            $.getJSON(this.options.baseUrl+'/mattermost/mattermostchat/getLastPosts?lastupdate='+self.lastupdate+'&channelid='+self.currentChannelId, function(data){
                self._addPosts(data);
                self.lastupdate = Date.now();
            });
        },
        /** Web socket management **/
        _sendWebsocketMessage: function(action, data, callback) {
            var msg = {
                "action": action,
                "seq": this.sequence++,
                "data": data
            };
            if(callback) {
                this.responseCallbacks[msg.seq] = callback;
            }
            if (this.conn && this.conn.readyState === WebSocket.OPEN) {
                this.conn.send(JSON.stringify(msg));
            }
        },
        _sendGetStatuses: function() {
            var self = this;
            this._sendWebsocketMessage("get_statuses", null, function(data){self._changeStatuses(data)});
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
        _scrollToBottom: function() {
            var container = this.element.find('#conversation');
            if (!this.userScroll) {
                //go to the last message only if no user scroll
                container.scrollTop(container[0].scrollHeight);
            }
        }
    });
})(jQuery);