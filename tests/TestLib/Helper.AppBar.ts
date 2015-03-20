// Copyright (c) Microsoft Corporation.  All Rights Reserved. Licensed under the MIT License. See License.txt in the project root for license information.
///<reference path="Helper.ts" />
///<reference path="../TestLib/winjs.dev.d.ts" />

module Helper.AppBar {
    "use strict";

    export function verifyRenderedOpened(appBar: WinJS.UI.PrivateAppBar): void {

        //TODO Verify correct commandingsurface overflowdirection based on AppBar placement?

        // TODO verify that the AppBar element has the same bounding rect as the the Commanding surface element.

        Helper._CommandingSurface.verifyRenderedOpened(appBar._commandingSurface);
    }

    export function verifyRenderedClosed(appBar: WinJS.UI.PrivateAppBar): void {

        // TODO verify that the AppBar element has the same bounding rect as the the Commanding surface element.

        Helper._CommandingSurface.verifyRenderedClosed(appBar._commandingSurface);
    }

}