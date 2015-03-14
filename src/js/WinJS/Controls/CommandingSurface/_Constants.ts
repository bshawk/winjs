// Copyright (c) Microsoft Corporation.  All Rights Reserved. Licensed under the MIT License. See License.txt in the project root for license information.

// CommandingSurface class names
export var ClassNames = {
    controlCssClass: "win-commandingsurface",
    disposableCssClass: "win-disposable",
    actionAreaCssClass: "win-commandingsurface-actionarea",
    overflowButtonCssClass: "win-commandingsurface-overflowbutton",
    spacerCssClass: "win-commandingsurface-spacer",
    ellipsisCssClass: "win-commandingsurface-ellipsis",
    overflowAreaCssClass: "win-commandingsurface-overflowarea",
    contentFlyoutCssClass: "win-commandingsurface-contentflyout",
    emptyCommandingSurfaceCssClass: "win-commandingsurface-empty",
    menuCssClass: "win-menu",
    menuContainsToggleCommandClass: "win-menu-containstogglecommand",
    menuContainsFlyoutCommandClass: "win-menu-containsflyoutcommand",
    openingClass: "win-commandingsurface-opening",
    openedClass: "win-commandingsurface-opened",
    closingClass: "win-commandingsurface-closing",
    closedClass: "win-commandingsurface-closed",
    noneClass: "win-commandingsurface-closeddisplaynone",
    minimalClass: "win-commandingsurface-closeddisplayminimal",
    compactClass: "win-commandingsurface-closeddisplaycompact",
    fullClass: "win-commandingsurface-closeddisplayfull",
    topToBottomClass: "win-commandingsurface-toptobottom",
    bottomToTopClass: "win-commandingsurface-bottomtotop",
};

export var EventNames = {
    /* TODO Update the string literals to the proper open/close nomenclature once we move the state machine and splitview over to the new names. */
    beforeShow: "beforeshow",
    afterShow: "aftershow",
    beforeHide: "beforehide",
    afterHide: "afterhide"
};

export var actionAreaCommandWidth = 68;
export var actionAreaSeparatorWidth = 34;
export var actionAreaOverflowButtonWidth = 32;
export var overflowCommandHeight = 44;
export var overflowSeparatorHeight = 12;

export var controlMinWidth = actionAreaOverflowButtonWidth;
export var heightOfMinimal = 24;
export var heightOfCompact = 48;

export var contentMenuCommandDefaultLabel = "Custom content";

export var defaultClosedDisplayMode = "compact";
export var defaultOpened = false;
export var defaultOrientation = "top";

// Constants for commands
export var typeSeparator = "separator";
export var typeContent = "content";
export var typeButton = "button";
export var typeToggle = "toggle";
export var typeFlyout = "flyout";

export var commandSelector = ".win-command"; 

export var primaryCommandSection = "primary";
export var secondaryCommandSection = "secondary";