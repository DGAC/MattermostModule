# Chat module for ZF2 and Bootstrap 3

**WIP : This module is usable but it needs more love :)**

## Mandatory screenshot

![screenshot](https://raw.githubusercontent.com/DGAC/MattermostModule/master/mattermostmodule.png)

## Installation

```composer require dgac/mattermostmodule```

## Configuration

* Add module in your application modules

* Use ```mattermostmessenger.local.php.dist``` to add your configuration

## Usage

* Add CSS files to your view. 

  - Bootstrap 3
  - Font Awesome 4 

Example : 

```php
echo $this->headLink()
              ->appendStylesheet($this->basePath() . '/<path to your bootstrap>/bootstrap.min.css')
              ->appendStylesheet($this->basePath() . '/assets/css/font-awesome.min.css')
              ->appendStylesheet($this->basePath() . '/assets/css/mattermostchat.css');

```

* Add javascript dependencies. 

  - JQuery
  - JQuery-UI
  - Bootstrap 3
  - Moment.js : http://momentjs.com/
  - List.js : http://listjs.com/
  - Marked : https://github.com/chjj/marked

Example :

```php
echo $this->headScript()
    ->appendFile($this->basePath() . '/<path to your jquery>/jquery.min.js')
    ->appendFile($this->basePath() . '/<path to your jquery-ui>/jquery-ui.min.js')
    ->appendFile($this->basePath() . '/<path to your bootstrap>/bootstrap.min.js')
    ->appendFile($this->basePath() . '/<path to your momentjs>/moment.min.js')
    ->appendFile($this->basePath() . '/<path to your list.js>/list.min.js')
    ->appendFile($this->basePath() . '/<path to your marked.js>/marked.min.js')
    ->appendFile($this->basePath() . '/assets/js/mattermostchat.js');
```
 
* Use view helper :
```html
<div class="chat-container">
    <?php echo $this->mattermost();?>
</div>
```

* And finally configure the Jquery UI Widget :
```javascript
$('.chat-container').mattermost({
            baseUrl: '<?php echo $this->basePath(); ?>',
            userName: '<?php echo $this->mattermost['login'];?>',
            teamName: '<?php echo $this->mattermost['team_id'];?>',
            channelId: '<?php echo $this->mattermost['defaultchannelid'];?>',
            token: '<?php echo $this->mattermost['token'];?>',
            serverUrl: '<?php echo $this->mattermost['server_url'];?>'
        });
```
