// Copyright (c) Microsoft Corporation.  All Rights Reserved. Licensed under the MIT License. See License.txt in the project root for license information.
///<reference path="Helper.ts" />
///<reference path="../TestLib/winjs.dev.d.ts" />

module Helper.ToolBar {
    "use strict";

    var _CommandingSurface = <typeof WinJS.UI.PrivateCommandingSurface> Helper.require("WinJS/Controls/CommandingSurface/_CommandingSurface")._CommandingSurface;

    export function verifyRenderedOpened(toolBar: WinJS.UI.PrivateToolBar): void {
        // Verifies that the ToolBar is rendered correctly when opened. 
        // Specifically,
        // 1) Be light dismissible, this includes a click-eating-div (CED) to cover up all other content.
        // 2) Be interact-able, this requires that the ToolBar element be rendered above the CED on the z-stack.
        // 3) Take up layout space when closed, but partially overlay when opened. This means that any 
        // additional space that the ToolBar consumes when it is opened, should not reflow app content, but 
        // overlay on top of the content that was already there.
        //
        // Because the CED needs to cover all other app content it needs to be a child of the body and have a 
        // really high z-index. 
        // Because the ToolBar needs to take up layout space when closed, it is an element that you position 
        // statically in the flow of your document. 
        // Because the ToolBar needs to be interactable when opened, it needs to be positioned non-statically 
        // in the body with an even higher z-index than the CED.
        // Because the ToolBar needs to avoid causing app content to reflow when it opens and closes, it leaves
        // a placeholder element of the same size in its place while the ToolBar is opened. The ToolBar uses
        // fixed positioning, to reposition itself over the placeholder element to create the illusion that it
        // never moved.

        var toolBarRect = toolBar.element.getBoundingClientRect();
        var commandingSurfaceRect = toolBar._dom.commandingSurfaceEl.getBoundingClientRect();
        var placeHolder = toolBar._dom.placeHolder; 
        var placeHolderRect = placeHolder.getBoundingClientRect();

        // Verify that the ToolBar element has the same ClientRect as its CommandingSurface.
        var msg = "Opened ToolBar should have the same BoundingClientRect as its CommandingSurface.";
        Helper.Assert.areBoundingClientRectsEqual(commandingSurfaceRect, toolBarRect, msg, 1); 

        // Verify that the opened toolbar is a child of the body element with fixed position.
        LiveUnit.Assert.isTrue(toolBar.element.parentElement === document.body, "Opened ToolBar must be a child of the <body> element");
        LiveUnit.Assert.isTrue(getComputedStyle(toolBar.element).position === "fixed", "Opened ToolBar must have fixed positioning");

        // Verify that the placeholder element is a child of the body with static positioning.
        LiveUnit.Assert.isTrue(document.body.contains(placeHolder), "placeholder element must be a descendant of the <body> while ToolBar is opened.");
        LiveUnit.Assert.isTrue(getComputedStyle(placeHolder).position === "static", "placeholder element must have static positioning");

        // Verify the ToolBar chose the correct overflow direction when opening based on the amount of vertical
        // space between where it's placeholder now is and the top/bottom edges of the viewport. 
        var distanceFromTop = placeHolderRect.top;
        var disatanceFromBottom = window.innerHeight - placeHolderRect.bottom;

        // Verify that based on our overflowdirection, we are correctly positioned on top of the placeholder element.
        LiveUnit.Assert.areEqual(toolBarRect.width, placeHolderRect.width, "Opened ToolBar must have same width as its placeholder element");
        LiveUnit.Assert.areEqual(toolBarRect.left, placeHolderRect.left, "Opened ToolBar must have same left offset as its placeholder element");

        switch (toolBar._commandingSurface.overflowDirection) {
            case _CommandingSurface.OverflowDirection.bottom: 

                LiveUnit.Assert.areEqual(toolBarRect.top, placeHolderRect.top, "")
                break;
            case _CommandingSurface.OverflowDirection.top:

                LiveUnit.Assert.areEqual(toolBarRect.bottom, placeHolderRect.bottom, "")
                break;
        }

        Helper._CommandingSurface.verifyRenderedOpened(toolBar._commandingSurface);
    }

    export function verifyRenderedClosed(toolBar: WinJS.UI.PrivateToolBar): void {
        var toolBarRect = toolBar.element.getBoundingClientRect();
        var commandingSurfaceRect = toolBar._dom.commandingSurfaceEl.getBoundingClientRect();
        var placeHolder = toolBar._dom.placeHolder;

        // Verify that the Closed ToolBar element has the same ClientRect as its CommandingSurface's element.
        LiveUnit.Assert.areEqual(toolBarRect.height, commandingSurfaceRect.height, "Closed ToolBar and CommandingSurface must have the same height.");
        LiveUnit.Assert.areEqual(toolBarRect.width, commandingSurfaceRect.width, "Closed ToolBar and CommandingSurface must have the same width.");
        LiveUnit.Assert.areEqual(toolBarRect.top, commandingSurfaceRect.top, "Closed ToolBar and CommandingSurface must have the same top offset.");
        LiveUnit.Assert.areEqual(toolBarRect.left, commandingSurfaceRect.left, "Closed ToolBar and CommandingSurface must have the same left offet.");

        // Verify we have a parent element and our placeHolder element does not.
        LiveUnit.Assert.isTrue(document.body.contains(toolBar.element), "Closed ToolBar must be a descendant of the body");
        LiveUnit.Assert.isFalse(placeHolder.parentElement, "placeholder must not be in the DOM, while ToolBar is closed");

        Helper._CommandingSurface.verifyRenderedClosed(toolBar._commandingSurface);
    }

    export function useSynchronousAnimations(appBar: WinJS.UI.PrivateToolBar) {
        Helper._CommandingSurface.useSynchronousAnimations(appBar._commandingSurface);
    }
}