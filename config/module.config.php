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
return array(
    'router' => array(
        'routes' => array(
            'mattermost' => array(
                'type' => 'segment',
                'may_terminate' => true,
                'options' => array(
                    'route' => '/mattermost/[:controller[/:action[/:id]]]',
                    'constraints' => array(
                        'action' => '[a-zA-Z][a-zA-Z0-9_-]*',
                        'controller' => '[a-zA-Z][a-zA-Z0-9-]*',
                        'id' => '[0-9]+'
                    ),
                    'defaults' => array(
                        '__NAMESPACE__' => 'MattermostMessenger\Controller',
                        'controller' => 'MattermostChat',
                        'action' => 'getLastPosts'
                    )
                )
            )
        )
    ),
    'service_manager' => array(
        'factories' => array(
            'mattermostservice' => 'MattermostMessenger\Factories\MattermostServiceFactory',
        )
    ),
    'controllers' => array(
        'factories' => array(
            'MattermostMessenger\Controller\MattermostChat' => 'MattermostMessenger\Controller\Factory\MattermostChatControllerFactory',
        )
    ),
    'view_helpers' => array(
        'invokables' => array(
            'mattermostchat' => 'MattermostMessenger\View\Helper\MattermostChatHelper',
            'user' => 'MattermostMessenger\View\Helper\UserHelper',
            'mymessage' => 'MattermostMessenger\View\Helper\MyMessageHelper',
            'othermessage' => 'MattermostMessenger\View\Helper\OtherMessageHelper'
        ),

    ),
    'view_manager' => array(
        'display_not_found_reason' => false,
        'display_exceptions' => false,
        'doctype' => 'HTML5',
        'not_found_template' => 'error/404',
        'exception_template' => 'error/index',
        'template_map' => array(
            'mattermostchat/mattermostchat' => __DIR__ . '/../view/mattermostmessenger/mattermostchat/mattermostchat.phtml',
        ),
        'template_path_stack' => array(
            __DIR__ . '/../view',
            __DIR__ . '/../view/mattermostmessenger'
        ),
        'strategies' => array(
            'ViewJsonStrategy'
        )
    ),
    'asset_manager' => array(
        'resolver_configs' => array(
            'paths' => array(
                __DIR__ . '/../public'
            )
        )
    ),
);