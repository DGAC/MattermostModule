<?php
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
namespace MattermostMessenger\Service;


use Gnello\Mattermost\Driver;
use Pimple\Container;

/**
 * Class MattermostService
 * @package MattermostMessenger\Service
 */
class MattermostService
{

    private $mattermost;

    private $client;

    private $myId;

    private $token;

    public function __construct($config)
    {
        $this->mattermost = $config['mattermost'];
    }

    private function getClient()
    {
        if($this->client == null) {
            $containerOptions = array(
                'driver' => array(
                    'url' => $this->mattermost['server_url'],
                    'login_id' => $this->mattermost['login'],
                    'password' => $this->mattermost['password']
                )
            );
            if(array_key_exists('proxy', $this->mattermost)) {
                $containerOptions['guzzle'] = array(
                    'proxy' => [
                        'http'  => $this->mattermost['proxy'],
                        'https' => $this->mattermost['proxy'],
                    ]
                );
            }
            $container = new Container($containerOptions);
            $this->client = new Driver($container);
            $result = $this->client->authenticate();
            if($result->getStatusCode() == 200) {
                //OK !
                $this->myId = json_decode($result->getBody())->id;
                $this->token = $result->getHeader('Token')[0];
            } else {
                //TODO throw something or retry ?
                error_log("Impossible de s'authentifier au serveur, erreur ".$result->getStatusCode());
            }
        }
        return $this->client;
    }

    public function getToken(){
        if(!$this->token){
            $this->getClient();
        }
        return $this->token;
    }

    /**
     * @param $message
     * @param $channelId
     * @return int 201 if successfull
     */
    public function sendMessageToChannel($message, $channelId)
    {
        $requestOptions = array(
            'channel_id' => $channelId,
            'message' => $message
        );
        $result = $this->getClient()->getPostModel()->createPost($requestOptions);
        return $result->getStatusCode();
    }

    /**
     * @param $channelId
     * @param int $number
     * @return mixed
     * @throws \Exception
     */
    public function getLastPostsFromChannel($channelId, $number = 20)
    {
        $requestOptions = array(
            'per_page' => $number
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode()." : ".$result->getBody());
        }
    }

    public function getLastPostsFromChannelSince($channelId, $time)
    {
        $requestOptions = array(
            'since' => $time
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode());
        }
    }

    public function getLastPostsFromChannelAfter($channelId, $postId)
    {
        $requestOptions = array(
            'after' => $postId
        );
        $result = $this->getClient()->getPostModel()->getPostsForChannel($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les posts. Erreur ".$result->getStatusCode());
        }
    }

    public function getPost($id)
    {
        $result = $this->getClient()->getPostModel()->getPost($id);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer le post");
        }
    }

    public function getUsername($userid){
        $result = $this->getClient()->getUserModel()->getUser($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->username;
        } else {
            throw new \Exception("Impossible de récupérer l'utilisateur.");
        }
    }

    public function getUserPicture($userid) {
        $result = $this->getClient()->getUserModel()->getUserProfileImage($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            return null;
        }
    }

    public function getTeamId($teamname)
    {
        $result = $this->getClient()->getTeamModel()->getTeamByName($teamname);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->id;
        } else {
            throw new \Exception("Impossible de récupérer l'équipe. Erreur ".$result->getStatusCode());
        }
    }

    public function getChannelMembers($channelId, $page = 0)
    {
        $requestOptions = array('page' => $page);
        $result = $this->getClient()->getChannelModel()->getChannelMembers($channelId, $requestOptions);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les utilisateurs.");
        }
    }

    public function getMyChannelsByTeamName($teamName)
    {
        $teamId = $this->getTeamId($teamName);
        return $this->getMyChannels($teamId);
    }

    public function getMyChannels($teamid)
    {
        $result = $this->getClient()->getChannelModel()->getChannelsForUser('me', $teamid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les canaux. Erreur ".$result->getStatusCode());
        }
    }

    public function getChannelName($channelid)
    {
        $result = $this->getClient()->getChannelModel()->getChannel($channelid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->display_name;
        } else {
            throw new \Exception("Impossible de récupérer le canal. Erreur ".$result->getStatusCode());
        }
    }

    public function getUserStatus($userid)
    {
        $result = $this->getClient()->getUserModel()->getUserStatus($userid);
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody())->status;
        } else {
            throw new \Exception("Impossible de récupérer le statut. Erreur ".$result->getStatusCode());
        }
    }

    public function getUserStatusesById()
    {
        $result = $this->getClient()->getUserModel()->getUserStatusesById();
        if($result->getStatusCode() == 200) {
            return json_decode($result->getBody());
        } else {
            throw new \Exception("Impossible de récupérer les statuts. Erreur ".$result->getStatusCode());
        }
    }
}

