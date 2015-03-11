// Copyright (c) Microsoft Corporation.  All Rights Reserved. Licensed under the MIT License. See License.txt in the project root for license information.
/// <reference path="../../Core.d.ts" />
import Animations = require("../../Animations");
import _Base = require("../../Core/_Base");
import _BaseUtils = require("../../Core/_BaseUtils");
import BindingList = require("../../BindingList");
import ControlProcessor = require("../../ControlProcessor");
import _Constants = require("../CommandingSurface/_Constants");
import _Command = require("../AppBar/_Command");
import _CommandingSurfaceMenuCommand = require("../CommandingSurface/_MenuCommand");
import _Control = require("../../Utilities/_Control");
import _Dispose = require("../../Utilities/_Dispose");
import _ElementUtilities = require("../../Utilities/_ElementUtilities");
import _ErrorFromName = require("../../Core/_ErrorFromName");
import _Events = require('../../Core/_Events');
import _Flyout = require("../../Controls/Flyout");
import _Global = require("../../Core/_Global");
import _Hoverable = require("../../Utilities/_Hoverable");
import _KeyboardBehavior = require("../../Utilities/_KeyboardBehavior");
import Menu = require("../../Controls/Menu");
import _MenuCommand = require("../Menu/_Command");
import Promise = require('../../Promise');
import _Resources = require("../../Core/_Resources");
import Scheduler = require("../../Scheduler");
import _ShowHideMachine = require('../../Utilities/_ShowHideMachine');
import _WriteProfilerMark = require("../../Core/_WriteProfilerMark");

require(["require-style!less/styles-commandingsurface"]);
require(["require-style!less/colors-commandingsurface"]);

"use strict";

interface ICommandInfo {
    command: _Command.ICommand;
    width: number;
    priority: number;
}

interface ICommandWithType {
    element: HTMLElement;
    type: string;
}

interface IFocusableElementsInfo {
    elements: HTMLElement[];
    focusedIndex: number;
}

interface IDataChangeInfo {
    newElements: HTMLElement[];
    currentElements: HTMLElement[];
    added: HTMLElement[];
    deleted: HTMLElement[];
    affected: HTMLElement[];
}

var strings = {
    get ariaLabel() { return _Resources._getWinJSString("ui/commandingSurfaceAriaLabel").value; },
    get overflowButtonAriaLabel() { return _Resources._getWinJSString("ui/commandingSurfaceOverflowButtonAriaLabel").value; },
    get badData() { return "Invalid argument: The data property must an instance of a WinJS.Binding.List"; },
    get mustContainCommands() { return "The commandingSurface can only contain WinJS.UI.Command or WinJS.UI.AppBarCommand controls"; },
    get duplicateConstruction() { return "Invalid argument: Controls may only be instantiated one time for each DOM element"; }
};

var CommandLayoutPipeline = {
    newDataStage: 3,
    measuringStage: 2,
    layoutStage: 1,
    idle: 0,
};

var Orientation = {
    bottom: "bottom",
    top: "top",
    auto: "auto",
}

var ClosedDisplayMode = {
    /// <field locid="WinJS.UI._CommandingSurface.ClosedDisplayMode.none" helpKeyword="WinJS.UI._CommandingSurface.ClosedDisplayMode.none">
    /// When the _CommandingSurface is closed, the actionarea is not visible and doesn't take up any space.
    /// </field>
    none: "none",
    /// <field locid="WinJS.UI._CommandingSurface.ClosedDisplayMode.minimal" helpKeyword="WinJS.UI._CommandingSurface.ClosedDisplayMode.minimal">
    /// When the _CommandingSurface is closed, the height of the actionarea is reduced to the minimal height required to display only the actionarea overflowbutton. All other content in the actionarea is not displayed.
    /// </field>
    minimal: "minimal",
    /// <field locid="WinJS.UI._CommandingSurface.ClosedDisplayMode.compact" helpKeyword="WinJS.UI._CommandingSurface.ClosedDisplayMode.compact">
    /// When the _CommandingSurface is closed, the height of the actionarea is reduced such that button commands are still visible, but their labels are hidden.
    /// </field>
    compact: "compact",
    /// <field locid="WinJS.UI._CommandingSurface.ClosedDisplayMode.full" helpKeyword="WinJS.UI._CommandingSurface.ClosedDisplayMode.full">
    /// When the _CommandingSurface is closed, the height of the actionarea is always sized to content and does not change between opened and closed states.
    /// </field>
    full: "full",
};

var closedDisplayModeClassMap = {};
closedDisplayModeClassMap[ClosedDisplayMode.none] = _Constants.ClassNames.noneClass;
closedDisplayModeClassMap[ClosedDisplayMode.minimal] = _Constants.ClassNames.minimalClass;
closedDisplayModeClassMap[ClosedDisplayMode.compact] = _Constants.ClassNames.compactClass;
closedDisplayModeClassMap[ClosedDisplayMode.full] = _Constants.ClassNames.fullClass;

// Versions of add/removeClass that are no ops when called with falsy class names.
function addClass(element: HTMLElement, className: string): void {
    className && _ElementUtilities.addClass(element, className);
}
function removeClass(element: HTMLElement, className: string): void {
    className && _ElementUtilities.removeClass(element, className);
}

function diffElements(lhs: Array<HTMLElement>, rhs: Array<HTMLElement>): Array<HTMLElement> {
    // Subtract array rhs from array lhs.
    // Returns a new Array containing the subset of elements in lhs that are not also in rhs.
    return lhs.filter((commandElement) => { return rhs.indexOf(commandElement) < 0 })
}

/// <field>
/// <summary locid="WinJS.UI._CommandingSurface">
/// Represents an apaptive surface for displaying commands.
/// </summary>
/// </field>
/// <htmlSnippet supportsContent="true"><![CDATA[<div data-win-control="WinJS.UI._CommandingSurface">
/// <button data-win-control="WinJS.UI.Command" data-win-options="{id:'',label:'example',icon:'back',type:'button',onclick:null,section:'primary'}"></button>
/// </div>]]></htmlSnippet>
/// <part name="commandingSurface" class="win-commandingSurface" locid="WinJS.UI._CommandingSurface_part:commandingSurface">The entire CommandingSurface control.</part>
/// <part name="commandingSurface-overflowbutton" class="win-commandingSurface-overflowbutton" locid="WinJS.UI._CommandingSurface_part:CommandingSurface-overflowbutton">The commandingSurface overflow button.</part>
/// <part name="commandingSurface-overflowarea" class="win-commandingsurface-overflowarea" locid="WinJS.UI._CommandingSurface_part:CommandingSurface-overflowarea">The container for commands that overflow.</part>
/// <resource type="javascript" src="//$(TARGET_DESTINATION)/js/WinJS.js" shared="true" />
/// <resource type="css" src="//$(TARGET_DESTINATION)/css/ui-dark.css" shared="true" />
export class _CommandingSurface {

    private _id: string;
    private _contentFlyout: _Flyout.Flyout;
    private _contentFlyoutInterior: HTMLElement;
    private _hoverable = _Hoverable.isHoverable; /* force dependency on hoverable module */
    private _winKeyboard: _KeyboardBehavior._WinKeyboard;
    private _refreshBound: Function;
    private _resizeHandlerBound: (ev: any) => any;
    private _dataChangedEvents = ["itemchanged", "iteminserted", "itemmoved", "itemremoved", "reload"];
    private _machine: _ShowHideMachine.ShowHideMachine;
    private _data: BindingList.List<_Command.ICommand>;
    private _primaryCommands: _Command.ICommand[];
    private _secondaryCommands: _Command.ICommand[];
    private _chosenCommand: _Command.ICommand;
    private _refreshPending: boolean;
    private _rtl: boolean;
    private _disposed: boolean;
    private _nextLayoutStage: number;
    private _isOpenedMode: boolean;

    private _helper: any;

    // Measurements
    private _cachedMeasurements: {
        overflowButtonWidth: number;
        separatorWidth: number;
        standardCommandWidth: number;
        contentCommandWidths: { [uniqueID: string]: number };
        actionAreaContentBoxWidth: number;
    };

    // Dom elements
    private _dom: {
        root: HTMLElement;
        actionArea: HTMLElement;
        spacer: HTMLDivElement;
        overflowButton: HTMLButtonElement;
        overflowArea: HTMLElement;
    };

    /// <field locid="WinJS.UI._CommandingSurface.ClosedDisplayMode" helpKeyword="WinJS.UI._CommandingSurface.ClosedDisplayMode">
    /// Display options for the actionarea when the _CommandingSurface is closed.
    /// </field>
    static ClosedDisplayMode = ClosedDisplayMode;

    /// <field locid="WinJS.UI._CommandingSurface.Orientation" helpKeyword="WinJS.UI._CommandingSurface.Orientation">
    /// Display options used by the _Commandingsurface to determine which direction it should expand when opening.
    /// </field>
    static Orientation = Orientation;

    static supportedForProcessing: boolean = true;

    /// <field type="HTMLElement" domElement="true" hidden="true" locid="WinJS.UI._CommandingSurface.element" helpKeyword="WinJS.UI._CommandingSurface.element">
    /// Gets the DOM element that hosts the CommandingSurface.
    /// </field>
    get element() {
        return this._dom.root;
    }

    /// <field type="WinJS.Binding.List" locid="WinJS.UI._CommandingSurface.data" helpKeyword="WinJS.UI._CommandingSurface.data">
    /// Gets or sets the Binding List of WinJS.UI.Command for the CommandingSurface.
    /// </field>
    get data() {
        return this._data;
    }
    set data(value: BindingList.List<_Command.ICommand>) {
        this._writeProfilerMark("set_data,info");

        if (value !== this.data) {
            if (!(value instanceof BindingList.List)) {
                throw new _ErrorFromName("WinJS.UI._CommandingSurface.BadData", strings.badData);
            }

            if (this._data) {
                this._removeDataListeners();
            }
            this._data = value;
            this._addDataListeners();
            this._dataUpdated();
        }
    }

    private _closedDisplayMode: string;
    /// <field type="String" locid="WinJS.UI._CommandingSurface.closedDisplayMode" helpKeyword="WinJS.UI._CommandingSurface.closedDisplayMode">
    /// Gets or sets the closedDisplayMode for the CommandingSurface. Values are "none", "minimal", "compact", and "full".
    /// </field>
    get closedDisplayMode() {
        return this._closedDisplayMode;
    }
    set closedDisplayMode(value: string) {
        this._writeProfilerMark("set_closedDisplayMode,info");

        var isChangingState = (value !== this._closedDisplayMode);
        if (ClosedDisplayMode[value] && isChangingState) {
            this._closedDisplayMode = value;
            this._machine.updateDom();
        }
    }

    private _orientation: string;
    /// <field type="String" hidden="true" locid="WinJS.UI._CommandingSurface.orientation" helpKeyword="WinJS.UI._CommandingSurface.orientation">
    /// Gets or sets which direction the commandingSurface opens. Values are "toptobottom", "bottomtotop", and "auto".
    /// </field>
    get orientation(): string {
        return this._orientation;
    }
    set orientation(value: string) {
        var isChangingState = (value !== this._orientation);
        if (Orientation[value] && isChangingState) {
            this._orientation = value;
        }
    }

    /// <field type="Boolean" hidden="true" locid="WinJS.UI._CommandingSurface.opened" helpKeyword="WinJS.UI._CommandingSurface.opened">
    /// Gets or sets whether the _CommandingSurface is currently opened.
    /// </field>
    get opened(): boolean {
        return !this._machine.hidden;
    }
    set opened(value: boolean) {
        this._machine.hidden = !value;
    }

    constructor(element?: HTMLElement, options: any = {}) {
        /// <signature helpKeyword="WinJS.UI._CommandingSurface._CommandingSurface">
        /// <summary locid="WinJS.UI._CommandingSurface.constructor">
        /// Creates a new CommandingSurface control.
        /// </summary>
        /// <param name="element" type="HTMLElement" domElement="true" locid="WinJS.UI._CommandingSurface.constructor_p:element">
        /// The DOM element that will host the control.
        /// </param>
        /// <param name="options" type="Object" locid="WinJS.UI._CommandingSurface.constructor_p:options">
        /// The set of properties and values to apply to the new CommandingSurface control.
        /// </param>
        /// <returns type="WinJS.UI._CommandingSurface" locid="WinJS.UI._CommandingSurface.constructor_returnValue">
        /// The new CommandingSurface control.
        /// </returns>
        /// </signature>

        this._writeProfilerMark("constructor,StartTM");

        // Check to make sure we weren't duplicated
        if (element && element["winControl"]) {
            throw new _ErrorFromName("WinJS.UI._CommandingSurface.DuplicateConstruction", strings.duplicateConstruction);
        }

        this._initializeDom(element || _Global.document.createElement("div"));
        this._machine = new _ShowHideMachine.ShowHideMachine({
            eventElement: this._dom.root,
            onShow: () => {
                    closedActionAreaRect: this._dom.actionArea.getBoundingClientRect(),
                };

                this._isOpenedMode = true;
                this._updateDomImpl();
                this._applyOrientation(this.orientation);
                //return this._playShowAnimation(hiddenPaneThickness);
                return Promise.wrap();
            },
            onHide: () => {
                //return this._playHideAnimation(this._getHiddenPaneThickness()).then(() => {
                this._isOpenedMode = false;
                this._updateDomImpl();
                //});

                return Promise.wrap();
            },
            onUpdateDom: () => {
                this._updateDomImpl();
            },
            onUpdateDomWithIsShown: (isShown: boolean) => {
                this._isOpenedMode = isShown;
                this._updateDomImpl();
            }
        });

        // Initialize private state.
        this._disposed = false;
        this._primaryCommands = [];
        this._secondaryCommands = [];
        this._refreshBound = this._refresh.bind(this);
        this._resizeHandlerBound = this._resizeHandler.bind(this);
        this._winKeyboard = new _KeyboardBehavior._WinKeyboard(this._dom.root);
        this._refreshPending = false;
        this._rtl = false;
        this._nextLayoutStage = CommandLayoutPipeline.idle;
        this._isOpenedMode = _Constants.defaultOpened;

        // Initialize public properties.
        this.orientation = _Constants.defaultOrientation;
        this.closedDisplayMode = _Constants.defaultClosedDisplayMode;
        this.opened = this._isOpenedMode;
        if (!options.data) {
            // Shallow copy object so we can modify it.
            options = _BaseUtils._shallowCopy(options);

            // Set default data
            options.data = options.data || this._getDataFromDOMElements();
        }
        _Control.setOptions(this, options);

        // Event handlers
        _ElementUtilities._resizeNotifier.subscribe(this._dom.root, this._resizeHandlerBound);
        this._dom.root.addEventListener('keydown', this._keyDownHandler.bind(this));

        // Exit the Init state.
        _ElementUtilities._inDom(this._dom.root).then(() => {
            this._rtl = _Global.getComputedStyle(this._dom.root).direction === 'rtl';
            this._machine.initialized();
            this._writeProfilerMark("constructor,StopTM");
        });
    }
    /// <field type="Function" locid="WinJS.UI._CommandingSurface.onbeforeopen" helpKeyword="WinJS.UI._CommandingSurface.onbeforeopen">
    /// Occurs immediately before the control is opened.
    /// </field>
    onbeforeshow: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI._CommandingSurface.onafteropen" helpKeyword="WinJS.UI._CommandingSurface.onafteropen">
    /// Occurs immediately after the control is opened.
    /// </field>
    onaftershow: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI._CommandingSurface.onbeforeclose" helpKeyword="WinJS.UI._CommandingSurface.onbeforeclose">
    /// Occurs immediately before the control is closed.
    /// </field>
    onbeforehide: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI._CommandingSurface.onafterclose" helpKeyword="WinJS.UI._CommandingSurface.onafterclose">
    /// Occurs immediately after the control is closed.
    /// </field>
    onafterhide: (ev: CustomEvent) => void;

    open(): void {
        /// <signature helpKeyword="WinJS.UI._CommandingSurface.open">
        /// <summary locid="WinJS.UI._CommandingSurface.open">
        /// Opens the _CommandingSurface's actionarea and overflowarea
        /// </summary>
        /// </signature>
        this._machine.show();
    }

    close(): void {
        /// <signature helpKeyword="WinJS.UI._CommandingSurface.close">
        /// <summary locid="WinJS.UI._CommandingSurface.close">
        /// Closes the _CommandingSurface's actionarea and overflowarea
        /// </summary>
        /// </signature>
        this._machine.hide();
    }

    dispose(): void {
        /// <signature helpKeyword="WinJS.UI._CommandingSurface.dispose">
        /// <summary locid="WinJS.UI._CommandingSurface.dispose">
        /// Disposes this CommandingSurface.
        /// </summary>
        /// </signature>
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._machine.dispose();

        _ElementUtilities._resizeNotifier.unsubscribe(this._dom.root, this._resizeHandlerBound);

        if (this._contentFlyout) {
            this._contentFlyout.dispose();
            this._contentFlyout.element.parentNode.removeChild(this._contentFlyout.element);
        }

        _Dispose.disposeSubTree(this._dom.root);
    }

    forceLayout(): void {
        /// <signature helpKeyword="WinJS.UI._CommandingSurface.forceLayout">
        /// <summary locid="WinJS.UI._CommandingSurface.forceLayout">
        /// Forces the CommandingSurface to update its layout. Use this function when the window did not change size, but the container of the CommandingSurface changed size.
        /// </summary>
        /// </signature>
        this._meaurementsDirty();
        this._machine.updateDom();
    }

    private _writeProfilerMark(text: string) {
        _WriteProfilerMark("WinJS.UI._CommandingSurface:" + this._id + ":" + text);
    }

    private _applyOrientation(nextOrientation: string): string {

        switch (nextOrientation) {
            case Orientation.bottom:
                removeClass(this._dom.root, _Constants.ClassNames.topToBottomClass);
                addClass(this._dom.root, _Constants.ClassNames.bottomToTopClass);
                break;

            case Orientation.top:
                removeClass(this._dom.root, _Constants.ClassNames.bottomToTopClass);
                addClass(this._dom.root, _Constants.ClassNames.topToBottomClass);
                break;

            case Orientation.auto:
            default:
                // TODO build auto behaviour.
                this._applyOrientation(Orientation.top);
                break;
        }

        return "";
    }

                //    this._applyOrientation(Orientation.bottom);
                //}
                break;
        }

        return "";
    }

    private _fitBottom(): boolean {
        // Precondition: commandingsurface has opened state classes applied 
        // so we can measure open actionarea and overflow area.

        // helper.closedActionAreaRect

        // closedRect.top + openedAAHeight + openedOAHeight;
        var result = false;
        var actionAreaHeight = parseFloat(getComputedStyle(this._dom.actionArea).height);
        var overflowAreaHeight = parseFloat(getComputedStyle(this._dom.overflowArea).height);

        var overflowAreaTop = this._helper.closedActionAreaRect.top + actionAreaHeight;

        return (overflowAreaTop >= _keyboardInfo['_visibleDocTop'] &&
        overflowAreaTop + overflowAreaHeight <= _keyboardInfo._visibleDocBottom);
    }

    private _fitTop(): boolean {
        var result = false;

        // closedRect.bottom + openedAAHeight + openedOAHeight;

        return result;
        //return (this._nextTop >= _Overlay._Overlay._keyboardInfo._visibleDocTop &&
        //    this._nextTop + flyout.height <= _Overlay._Overlay._keyboardInfo._visibleDocBottom);
    }

    private _initializeDom(root: HTMLElement): void {

        this._writeProfilerMark("_intializeDom,info");

        // Attaching JS control to DOM element
        root["winControl"] = this;

        this._id = root.id || _ElementUtilities._uniqueID(root);

        if (!root.hasAttribute("tabIndex")) {
            root.tabIndex = -1;
        }

        _ElementUtilities.addClass(root, _Constants.ClassNames.controlCssClass);
        _ElementUtilities.addClass(root, "win-disposable");

        // Make sure we have an ARIA role
        var role = root.getAttribute("role");
        if (!role) {
            root.setAttribute("role", "menubar");
        }

        var label = root.getAttribute("aria-label");
        if (!label) {
            root.setAttribute("aria-label", strings.ariaLabel);
        }

        var actionArea = _Global.document.createElement("div");
        _ElementUtilities.addClass(actionArea, _Constants.ClassNames.actionAreaCssClass);
        _ElementUtilities._reparentChildren(root, actionArea);
        root.appendChild(actionArea);

        var spacer = _Global.document.createElement("div");
        _ElementUtilities.addClass(spacer, _Constants.ClassNames.spacerCssClass);
        actionArea.appendChild(spacer);

        var overflowButton = _Global.document.createElement("button");
        overflowButton.tabIndex = 0;
        overflowButton.innerHTML = "<span class='" + _Constants.ClassNames.ellipsisCssClass + "'></span>";
        _ElementUtilities.addClass(overflowButton, _Constants.ClassNames.overflowButtonCssClass);
        actionArea.appendChild(overflowButton);
        overflowButton.addEventListener("click", () => {
            this.opened = !this.opened;
        });

        var overflowArea = _Global.document.createElement("div");
        _ElementUtilities.addClass(overflowArea, _Constants.ClassNames.overflowAreaCssClass);
        _ElementUtilities.addClass(overflowArea, _Constants.ClassNames.menuCssClass);
        root.appendChild(overflowArea);

        this._dom = {
            root: root,
            actionArea: actionArea,
            spacer: spacer,
            overflowButton: overflowButton,
            overflowArea: overflowArea,
        };
    }

    private _getFocusableElementsInfo(): IFocusableElementsInfo {
        var focusableCommandsInfo: IFocusableElementsInfo = {
            elements: [],
            focusedIndex: -1
        };
        var elementsInReach = Array.prototype.slice.call(this._dom.actionArea.children);

        var elementsInReach = Array.prototype.slice.call(this._dom.actionArea.children);
        if (this._dom.overflowArea.style.display !== "none") {
            elementsInReach = elementsInReach.concat(Array.prototype.slice.call(this._dom.overflowArea.children));
        }

        elementsInReach.forEach((element: HTMLElement) => {
            if (this._isElementFocusable(element)) {
                focusableCommandsInfo.elements.push(element);
                if (element.contains(<HTMLElement>_Global.document.activeElement)) {
                    focusableCommandsInfo.focusedIndex = focusableCommandsInfo.elements.length - 1;
                }
            }
        });

        return focusableCommandsInfo;
    }

    private _dataUpdated() {
        this._primaryCommands = [];
        this._secondaryCommands = [];

        if (this.data.length > 0) {
            this.data.forEach((command) => {
                if (command.section === "secondary") {
                    this._secondaryCommands.push(command);
                } else {
                    this._primaryCommands.push(command);
                }
            });
        }
        this._dataDirty();
        this._machine.updateDom();
    }

    private _refresh() {
        if (!this._refreshPending) {
            this._refreshPending = true;

            // Batch calls to _dataUpdated
            Scheduler.schedule(() => {
                if (this._refreshPending && !this._disposed) {
                    this._refreshPending = false;
                    this._dataUpdated();
                }
            }, Scheduler.Priority.high, null, "WinJS.UI._CommandingSurface._refresh");
        }
    }

    private _addDataListeners() {
        this._dataChangedEvents.forEach((eventName) => {
            this._data.addEventListener(eventName, this._refreshBound, false);
        });
    }

    private _removeDataListeners() {
        this._dataChangedEvents.forEach((eventName) => {
            this._data.removeEventListener(eventName, this._refreshBound, false);
        });
    }

    private _isElementFocusable(element: HTMLElement): boolean {
        var focusable = false;
        if (element) {
            var command = element["winControl"];
            if (command) {
                focusable = command.element.style.display !== "none" &&
                command.type !== _Constants.typeSeparator &&
                !command.hidden &&
                !command.disabled &&
                (!command.firstElementFocus || command.firstElementFocus.tabIndex >= 0 || command.lastElementFocus.tabIndex >= 0);
            } else {
                // e.g. the overflow button
                focusable = element.style.display !== "none" &&
                getComputedStyle(element).visibility !== "hidden" &&
                element.tabIndex >= 0;
            }
        }
        return focusable;
    }

    private _isCommandInActionArea(element: HTMLElement) {
        // Returns true if the element is a command in the actionarea, false otherwise
        return element && element["winControl"] && element.parentElement === this._dom.actionArea;
    }

    private _getLastElementFocus(element: HTMLElement) {
        if (this._isCommandInActionArea(element)) {
            // Only commands in the actionarea support lastElementFocus
            return element["winControl"].lastElementFocus;
        } else {
            return element;
        }
    }

    private _getFirstElementFocus(element: HTMLElement) {
        if (this._isCommandInActionArea(element)) {
            // Only commands in the actionarea support firstElementFocus
            return element["winControl"].firstElementFocus;
        } else {
            return element;
        }
    }

    private _keyDownHandler(ev: any) {
        if (!ev.altKey) {
            if (_ElementUtilities._matchesSelector(ev.target, ".win-interactive, .win-interactive *")) {
                return;
            }
            var Key = _ElementUtilities.Key;
            var focusableElementsInfo = this._getFocusableElementsInfo();
            var targetCommand: HTMLElement;

            if (focusableElementsInfo.elements.length) {
                switch (ev.keyCode) {
                    case (this._rtl ? Key.rightArrow : Key.leftArrow):
                    case Key.upArrow:
                        var index = Math.max(0, focusableElementsInfo.focusedIndex - 1);
                        targetCommand = this._getLastElementFocus(focusableElementsInfo.elements[index % focusableElementsInfo.elements.length]);
                        break;

                    case (this._rtl ? Key.leftArrow : Key.rightArrow):
                    case Key.downArrow:
                        var index = Math.min(focusableElementsInfo.focusedIndex + 1, focusableElementsInfo.elements.length - 1);
                        targetCommand = this._getFirstElementFocus(focusableElementsInfo.elements[index]);
                        break;

                    case Key.home:
                        var index = 0;
                        targetCommand = this._getFirstElementFocus(focusableElementsInfo.elements[index]);
                        break;

                    case Key.end:
                        var index = focusableElementsInfo.elements.length - 1;
                        targetCommand = this._getLastElementFocus(focusableElementsInfo.elements[index]);
                        break;
                }
            }

            if (targetCommand && targetCommand !== _Global.document.activeElement) {
                targetCommand.focus();
                ev.preventDefault();
            }
        }
    }

    private _getDataFromDOMElements(): BindingList.List<_Command.ICommand> {
        this._writeProfilerMark("_getDataFromDOMElements,info");

        ControlProcessor.processAll(this._dom.actionArea, /*skip root*/ true);

        var commands: _Command.ICommand[] = [];
        var childrenLength = this._dom.actionArea.children.length;
        var child: Element;
        for (var i = 0; i < childrenLength; i++) {
            child = this._dom.actionArea.children[i];
            if (child["winControl"] && child["winControl"] instanceof _Command.AppBarCommand) {
                commands.push(child["winControl"]);
            } else if (!this._dom.overflowButton) {
                throw new _ErrorFromName("WinJS.UI._CommandingSurface.MustContainCommands", strings.mustContainCommands);
            }
        }
        return new BindingList.List(commands);
    }

    private _resizeHandler() {
        if (this._dom.root.offsetWidth) {
            var currentActionAreaWidth = _ElementUtilities.getContentWidth(this._dom.actionArea);
            if (this._cachedMeasurements && this._cachedMeasurements.actionAreaContentBoxWidth !== currentActionAreaWidth) {
                this._cachedMeasurements.actionAreaContentBoxWidth = currentActionAreaWidth
                this._layoutDirty();
                this._machine.updateDom();
            }
        }
    }

    // Should be called while _CommandingSurface is rendered in its opened mode
    // Overridden by tests.
    private _playShowAnimation(): Promise<any> {
        return Promise.wrap();
    }
    // Should be called while SplitView is rendered in its opened mode
    // Overridden by tests.
    private _playHideAnimation(): Promise<any> {
        return Promise.wrap();
    }

    private _dataDirty(): void {
        this._nextLayoutStage = Math.max(CommandLayoutPipeline.newDataStage, this._nextLayoutStage);
    }
    private _meaurementsDirty(): void {
        this._nextLayoutStage = Math.max(CommandLayoutPipeline.measuringStage, this._nextLayoutStage);
    }
    private _layoutDirty(): void {
        this._nextLayoutStage = Math.max(CommandLayoutPipeline.layoutStage, this._nextLayoutStage);
    }
    private _updateDomImpl(): void {
        this._updateDomImpl_renderDisplayMode();
        this._updateDomImpl_updateCommands();
    }

    // State private to _updateDomImpl_renderDisplayMode. No other method should make use of it.
    //
    // Nothing has been rendered yet so these are all initialized to undefined. Because
    // they are undefined, the first time _updateDomImpl is called, they will all be
    // rendered.
    private _updateDomImpl_renderedState = {
        closedDisplayMode: <string>undefined,
        opened: <boolean>undefined,
    };
    private _updateDomImpl_renderDisplayMode(): void {
        var rendered = this._updateDomImpl_renderedState;

        if (rendered.opened !== this._isOpenedMode) {
            if (this._isOpenedMode) {
                // Render opened
                removeClass(this._dom.root, _Constants.ClassNames.closedClass);
                addClass(this._dom.root, _Constants.ClassNames.openedClass);
                this._applyOrientation(this.orientation);
            } else {
                // Render closed
                removeClass(this._dom.root, _Constants.ClassNames.openedClass);
                addClass(this._dom.root, _Constants.ClassNames.closedClass);
            }
            rendered.opened = this._isOpenedMode;
        }

        if (rendered.closedDisplayMode !== this.closedDisplayMode) {
            removeClass(this._dom.root, closedDisplayModeClassMap[rendered.closedDisplayMode]);
            addClass(this._dom.root, closedDisplayModeClassMap[this.closedDisplayMode]);
            rendered.closedDisplayMode = this.closedDisplayMode;
        }
    }

    private _updateDomImpl_updateCommands(): void {
        this._writeProfilerMark("_updateDomImpl_updateCommands,info");

        var nextStage = this._nextLayoutStage;
        // The flow of stages in the CommandLayoutPipeline is defined as:
        //      newDataStage -> measuringStage -> layoutStage -> idle
        while (nextStage !== CommandLayoutPipeline.idle) {
            var currentStage = nextStage;
            var okToProceed = false;
            switch (currentStage) {
                case CommandLayoutPipeline.newDataStage:
                    nextStage = CommandLayoutPipeline.measuringStage;
                    okToProceed = this._processNewData();
                    break;
                case CommandLayoutPipeline.measuringStage:
                    nextStage = CommandLayoutPipeline.layoutStage;
                    okToProceed = this._measure();
                    break;
                case CommandLayoutPipeline.layoutStage:
                    nextStage = CommandLayoutPipeline.idle;
                    okToProceed = this._layoutCommands();
                    break;
            }

            if (!okToProceed) {
                // If a stage fails, exit the loop and track that stage
                // to be restarted the next time _updateCommands is run.
                nextStage = currentStage;
                break;
            }
        }
        this._nextLayoutStage = nextStage;
    }

    private _getDataChangeInfo(): IDataChangeInfo {
        var i = 0, len = 0;
        var added: HTMLElement[] = [];
        var deleted: HTMLElement[] = [];
        var affected: HTMLElement[] = [];
        var currentShown: HTMLElement[] = [];
        var currentElements: HTMLElement[] = [];
        var newShown: HTMLElement[] = [];
        var newHidden: HTMLElement[] = [];
        var newElements: HTMLElement[] = [];

        Array.prototype.forEach.call(this._dom.actionArea.querySelectorAll(".win-command"), (commandElement: HTMLElement) => {
            if (commandElement.style.display !== "none") {
                currentShown.push(commandElement);
            }
            currentElements.push(commandElement);
        });

        this.data.forEach((command) => {
            if (command.element.style.display !== "none") {
                newShown.push(command.element);
            } else {
                newHidden.push(command.element);
            }
            newElements.push(command.element);
        });

        deleted = diffElements(currentShown, newShown);
        affected = diffElements(currentShown, deleted);
        // "added" must also include the elements from "newHidden" to ensure that we continue
        // to animate any command elements that have underflowed back into the actionarea
        // as a part of this data change.
        added = diffElements(newShown, currentShown).concat(newHidden);

        return {
            newElements: newElements,
            currentElements: currentElements,
            added: added,
            deleted: deleted,
            affected: affected,
        };
    }

    private _processNewData(): boolean {
        this._writeProfilerMark("_processNewData,info");

        var changeInfo = this._getDataChangeInfo();

        // Take a snapshot of the current state
        var updateCommandAnimation = Animations._createUpdateListAnimation(changeInfo.added, changeInfo.deleted, changeInfo.affected);

        // Remove current ICommand elements
        changeInfo.currentElements.forEach((element) => {
            if (element.parentElement) {
                element.parentElement.removeChild(element);
            }
        });

        // Add new ICommand elements in the right order.
        changeInfo.newElements.forEach((element) => {
            this._dom.actionArea.appendChild(element);
        });

        // Ensure that the overflow button is always the last element in the actionarea
        this._dom.actionArea.appendChild(this._dom.overflowButton);
        if (this.data.length > 0) {
            _ElementUtilities.removeClass(this._dom.root, _Constants.ClassNames.emptyCommandingSurfaceCssClass);
        } else {
            _ElementUtilities.addClass(this._dom.root, _Constants.ClassNames.emptyCommandingSurfaceCssClass);
        }

        // Execute the animation.
        updateCommandAnimation.execute();

        // Indicate processing was successful.
        return true;
    }

    private _measure(): boolean {
        this._writeProfilerMark("_measure,info");
        var canMeasure = (_Global.document.body.contains(this._dom.root) && this._dom.actionArea.offsetWidth > 0);
        if (canMeasure) {
            var overflowButtonWidth = _ElementUtilities.getTotalWidth(this._dom.overflowButton),
                actionAreaContentBoxWidth = _ElementUtilities.getContentWidth(this._dom.actionArea),
                separatorWidth = 0,
                standardCommandWidth = 0,
                contentCommandWidths: { [uniqueID: string]: number; } = {};

            this._primaryCommands.forEach((command) => {
                // Ensure that the element we are measuring does not have display: none (e.g. it was just added, and it
                // will be animated in)
                var originalDisplayStyle = command.element.style.display;
                command.element.style.display = "";

                if (command.type === _Constants.typeContent) {
                    // Measure each 'content' command type that we find
                    contentCommandWidths[this._commandUniqueId(command)] = _ElementUtilities.getTotalWidth(command.element);
                } else if (command.type === _Constants.typeSeparator) {
                    // Measure the first 'separator' command type we find.
                    if (!separatorWidth) {
                        separatorWidth = _ElementUtilities.getTotalWidth(command.element);
                    }
                } else {
                    // Button, toggle, 'flyout' command types have the same width. Measure the first one we find.
                    if (!standardCommandWidth) {
                        standardCommandWidth = _ElementUtilities.getTotalWidth(command.element);
                    }
                }

                // Restore the original display style
                command.element.style.display = originalDisplayStyle;
            });

            this._cachedMeasurements = {
                contentCommandWidths: contentCommandWidths,
                separatorWidth: separatorWidth,
                standardCommandWidth: standardCommandWidth,
                overflowButtonWidth: overflowButtonWidth,
                actionAreaContentBoxWidth: actionAreaContentBoxWidth,
            };

            // Indicate measure was successful
            return true;
        } else {
            // Indicate measure was unsuccessful
            return false;
        }
    }

    private _layoutCommands(): boolean {
        this._writeProfilerMark("_layoutCommands,StartTM");

        //
        // Filter commands that will not be visible in the actionarea
        //

        this._primaryCommands.forEach((command) => {
            command.element.style.display = (command.hidden ? "none" : "");
        })

        var primaryCommandsLocation = this._getPrimaryCommandsLocation();

        this._hideSeparatorsIfNeeded(primaryCommandsLocation.actionArea);

        // Primary commands that will be mirrored in the overflow area should be hidden so
        // that they are not visible in the actionarea.
        primaryCommandsLocation.overflowArea.forEach((command) => {
            command.element.style.display = "none";
        });

        // The secondary commands in the actionarea should be hidden since they are always
        // mirrored as new elements in the overflow area.
        this._secondaryCommands.forEach((command) => {
            command.element.style.display = "none";
        });

        var overflowCommands = primaryCommandsLocation.overflowArea;

        var showOverflowButton = (overflowCommands.length > 0 || this._secondaryCommands.length > 0);
        this._dom.overflowButton.style.display = showOverflowButton ? "" : "none";

        // Set up a custom content flyout if there will be "content" typed commands in the overflowarea. 
        var isCustomContent = (command: _Command.ICommand) => { return command.type === _Constants.typeContent };
        var hasCustomContent = overflowCommands.some(isCustomContent) || this._secondaryCommands.some(isCustomContent);

        if (hasCustomContent && !this._contentFlyout) {
            this._contentFlyoutInterior = _Global.document.createElement("div");
            _ElementUtilities.addClass(this._contentFlyoutInterior, _Constants.ClassNames.contentFlyoutCssClass);
            this._contentFlyout = new _Flyout.Flyout();
            this._contentFlyout.element.appendChild(this._contentFlyoutInterior);
            _Global.document.body.appendChild(this._contentFlyout.element);
            this._contentFlyout.onbeforeshow = () => {
                _ElementUtilities.empty(this._contentFlyoutInterior);
                _ElementUtilities._reparentChildren(this._chosenCommand.element, this._contentFlyoutInterior);
            };
            this._contentFlyout.onafterhide = () => {
                _ElementUtilities._reparentChildren(this._contentFlyoutInterior, this._chosenCommand.element);
            };
        }

        //
        // Project overflowing and secondary commands into the overflowArea as MenuCommands
        //

        _ElementUtilities.empty(this._dom.overflowArea);
        var hasToggleCommands = false,
            hasFlyoutCommands = false,
            menuCommandProjections: _MenuCommand.MenuCommand[] = [];

        // Add primary commands that have overflowed. 
        overflowCommands.forEach((command) => {
            if (command.type === _Constants.typeToggle) {
                hasToggleCommands = true;
            }

            if (command.type === _Constants.typeFlyout) {
                hasFlyoutCommands = true;
            }

            menuCommandProjections.push(this._projectAsMenuCommand(command));
        });

        // Add separator between primary and secondary command if applicable 
        var secondaryCommandsLength = this._secondaryCommands.length;
        if (overflowCommands.length > 0 && secondaryCommandsLength > 0) {
            var separator = new _CommandingSurfaceMenuCommand._MenuCommand(null, {
                type: _Constants.typeSeparator
            });

            menuCommandProjections.push(separator);
        }

        // Add secondary commands 
        this._secondaryCommands.forEach((command) => {
            if (!command.hidden) {
                if (command.type === _Constants.typeToggle) {
                    hasToggleCommands = true;
                }

                if (command.type === _Constants.typeFlyout) {
                    hasFlyoutCommands = true;
                }

                menuCommandProjections.push(this._projectAsMenuCommand(command));
            }
        });

        this._hideSeparatorsIfNeeded(menuCommandProjections);
        menuCommandProjections.forEach((command) => {
            this._dom.overflowArea.appendChild(command.element);
        })

        _ElementUtilities[hasToggleCommands ? "addClass" : "removeClass"](this._dom.overflowArea, _Constants.ClassNames.menuContainsToggleCommandClass);
        _ElementUtilities[hasFlyoutCommands ? "addClass" : "removeClass"](this._dom.overflowArea, _Constants.ClassNames.menuContainsFlyoutCommandClass);

        this._writeProfilerMark("_layoutCommands,StopTM");

        // Indicate layout was successful.
        return true;
    }

    private _commandUniqueId(command: _Command.ICommand): string {
        return _ElementUtilities._uniqueID(command.element);
    }

    private _getCommandsInfo(): ICommandInfo[] {
        var width = 0;
        var commands: ICommandInfo[] = [];
        var priority = 0;
        var currentAssignedPriority = 0;

        for (var i = this._primaryCommands.length - 1; i >= 0; i--) {
            var command = this._primaryCommands[i];
            if (command.priority === undefined) {
                priority = currentAssignedPriority--;
            } else {
                priority = command.priority;
            }
            width = (command.element.style.display === "none" ? 0 : this._getCommandWidth(command));

            commands.unshift({
                command: command,
                width: width,
                priority: priority
            });
        }

        return commands;
    }

    private _getPrimaryCommandsLocation() {
        this._writeProfilerMark("_getCommandsLocation,info");

        var actionAreaCommands: _Command.ICommand[] = [];
        var overflowAreaCommands: _Command.ICommand[] = [];
        var overflowButtonSpace = 0;
        var hasSecondaryCommands = this._secondaryCommands.length > 0;

        var commandsInfo = this._getCommandsInfo();
        var sortedCommandsInfo = commandsInfo.slice(0).sort((commandInfo1: ICommandInfo, commandInfo2: ICommandInfo) => {
            return commandInfo1.priority - commandInfo2.priority;
        });

        var maxPriority = Number.MAX_VALUE;
        var availableWidth = this._cachedMeasurements.actionAreaContentBoxWidth;

        for (var i = 0, len = sortedCommandsInfo.length; i < len; i++) {
            availableWidth -= sortedCommandsInfo[i].width;

            // The overflow button needs space if there are secondary commands, or we are not evaluating the last command.
            overflowButtonSpace = (hasSecondaryCommands || (i < len - 1) ? this._cachedMeasurements.overflowButtonWidth : 0);

            if (availableWidth - overflowButtonSpace < 0) {
                maxPriority = sortedCommandsInfo[i].priority - 1;
                break;
            }
        }

        commandsInfo.forEach((commandInfo) => {
            if (commandInfo.priority <= maxPriority) {
                actionAreaCommands.push(commandInfo.command);
            } else {
                overflowAreaCommands.push(commandInfo.command);
            }
        });

        return {
            actionArea: actionAreaCommands,
            overflowArea: overflowAreaCommands
        }
    }

    private _getCommandWidth(command: _Command.ICommand): number {
        if (command.type === _Constants.typeContent) {
            return this._cachedMeasurements.contentCommandWidths[this._commandUniqueId(command)];
        } else if (command.type === _Constants.typeSeparator) {
            return this._cachedMeasurements.separatorWidth;
        } else {
            return this._cachedMeasurements.standardCommandWidth;
        }
    }

    private _projectAsMenuCommand(originalCommand: _Command.ICommand): _MenuCommand.MenuCommand {
        var menuCommand = new _CommandingSurfaceMenuCommand._MenuCommand(null, {
            label: originalCommand.label,
            type: (originalCommand.type === _Constants.typeContent ? _Constants.typeFlyout : originalCommand.type) || _Constants.typeButton,
            disabled: originalCommand.disabled,
            flyout: originalCommand.flyout,
            beforeInvoke: () => {
                // Save the command that was selected
                this._chosenCommand = <_Command.ICommand>(menuCommand["_originalICommand"]);

                // If this WinJS.UI.MenuCommand has type: toggle, we should also toggle the value of the original WinJS.UI.Command
                if (this._chosenCommand.type === _Constants.typeToggle) {
                    this._chosenCommand.selected = !this._chosenCommand.selected;
                }
            }
        });

        if (originalCommand.selected) {
            menuCommand.selected = true;
        }

        if (originalCommand.extraClass) {
            menuCommand.extraClass = originalCommand.extraClass;
        }

        if (originalCommand.type === _Constants.typeContent) {
            if (!menuCommand.label) {
                menuCommand.label = _Constants.contentMenuCommandDefaultLabel;
            }
            menuCommand.flyout = this._contentFlyout;
        } else {
            menuCommand.onclick = originalCommand.onclick;
        }
        menuCommand["_originalICommand"] = originalCommand;
        return menuCommand;
    }

    private _hideSeparatorsIfNeeded(commands: ICommandWithType[]): void {
        var prevType = _Constants.typeSeparator;
        var command: ICommandWithType;

        // Hide all leading or consecutive separators
        var commandsLength = commands.length;
        commands.forEach((command) => {
            if (command.type === _Constants.typeSeparator &&
                prevType === _Constants.typeSeparator) {
                command.element.style.display = "none";
            }
            prevType = command.type;
        });

        // Hide trailing separators
        for (var i = commandsLength - 1; i >= 0; i--) {
            command = commands[i];
            if (command.type === _Constants.typeSeparator) {
                command.element.style.display = "none";
            } else {
                break;
            }
        }
    }
}

_Base.Class.mix(_CommandingSurface, _Events.createEventProperties(
    _Constants.EventNames.beforeShow,
    _Constants.EventNames.afterShow,
    _Constants.EventNames.beforeHide,
    _Constants.EventNames.afterHide));

// addEventListener, removeEventListener, dispatchEvent
_Base.Class.mix(_CommandingSurface, _Control.DOMEventMixin);
// WWA Soft Keyboard offsets
var _keyboardInfo = {
    // Determine if the keyboard is visible or not.
    get _visible() {

        try {
            return (
                _Global.window['Windows'] &&
                _Global.window['Windows.UI.ViewManagement.InputPane'].getForCurrentView().occludedRect.height > 0
                );
        } catch (e) {
            return false;
        }

    },

    // See if we have to reserve extra space for the IHM
    get _extraOccluded() {
        var occluded: number;
        if (window['Windows']) {
            try {
                occluded = _Global.window['Windows.UI.ViewManagement.InputPane'].getForCurrentView().occludedRect.height;
            } catch (e) {
            }
        }

        // Nothing occluded if not visible.
        if (occluded && !_keyboardInfo._isResized) {
            // View hasn't been resized, need to return occluded height.
            return occluded;
        }

        // View already has space for keyboard or there's no keyboard
        return 0;

    },

    // See if the view has been resized to fit a keyboard
    get _isResized() {
        // Compare ratios.  Very different includes IHM space.
        var heightRatio = _Global.document.documentElement.clientHeight / _Global.window.innerHeight,
            widthRatio = _Global.document.documentElement.clientWidth / _Global.window.innerWidth;

        // If they're nearly identical, then the view hasn't been resized for the IHM
        // Only check one bound because we know the IHM will make it shorter, not skinnier.
        return (widthRatio / heightRatio < 0.99);

    },

    // Get the bottom of our visible area.
    get _visibleDocBottom() {
        return _keyboardInfo['_visibleDocTop'] + _keyboardInfo._visibleDocHeight;

    },

    // Get the height of the visible document, e.g. the height of the visual viewport minus any IHM occlusion.
    get _visibleDocHeight() {
        return _keyboardInfo['_visualViewportHeight'] - _keyboardInfo._extraOccluded;

    },

    // Get total length of the IHM showPanel animation
    get _animationShowLength() {
        if (_Global.window["Windows"]) {
            var a = _Global.window['Windows.UI.Core.AnimationMetrics'],
                animationDescription = new a.AnimationDescription(a.AnimationEffect.showPanel, a.AnimationEffectTarget.primary);
            var animations = animationDescription.animations;
            var max = 0;
            for (var i = 0; i < animations.size; i++) {
                var animation = animations[i];
                max = Math.max(max, animation.delay + animation.duration);
            }
            return max;
        } else {
            return 0;
        }
    },
}

var visualViewportClass: string = "win-visualviewport-space";

var _addMixin = function () {
    if (_keyboardInfo['_visibleDocTop'] === undefined) {


        // Mixin for WWA's Soft Keyboard offsets when -ms-device-fixed CSS positioning is supported, or for general _Overlay positioning whenever we are in a web browser outside of WWA.
        // If we are in an instance of WWA, all _Overlay elements will use -ms-device-fixed positioning which fixes them to the visual viewport directly.
        var _keyboardInfo_Mixin = {

            // Get the top offset of our visible area, aka the top of the visual viewport.
            // This is always 0 when _Overlay elements use -ms-device-fixed positioning.
            _visibleDocTop: function _visibleDocTop() {
                return 0;
            },

            // Get the bottom offset of the visual viewport, plus any IHM occlusion.
            _visibleDocBottomOffset: function _visibleDocBottomOffset() {
                // For -ms-device-fixed positioned elements, the bottom is just 0 when there's no IHM.
                // When the IHM appears, the text input that invoked it may be in a position on the page that is occluded by the IHM.
                // In that instance, the default browser behavior is to resize the visual viewport and scroll the input back into view.
                // However, if the viewport resize is prevented by an IHM event listener, the keyboard will still occlude
                // -ms-device-fixed elements, so we adjust the bottom offset of the appbar by the height of the occluded rect of the IHM.
                return (_keyboardInfo._isResized) ? 0 : _keyboardInfo._extraOccluded;
            },

            // Get the visual viewport height. window.innerHeight doesn't return floating point values which are present with high DPI.
            _visualViewportHeight: function _visualViewportHeight() {
                var boundingRect = <ClientRect>_keyboardInfo['_visualViewportSpace'];
                return boundingRect.height;
            },

            // Get the visual viewport width. window.innerWidth doesn't return floating point values which are present with high DPI.
            _visualViewportWidth: function _visualViewportWidth() {
                var boundingRect = <ClientRect>_keyboardInfo['_visualViewportSpace'];
                return boundingRect.width;
            },

            _visualViewportSpace: function _visualViewportSpace() {

                var visualViewportSpace = <HTMLDivElement>_Global.document.body.querySelector("." + visualViewportClass);
                if (!visualViewportSpace) {
                    visualViewportSpace = <HTMLDivElement>_Global.document.createElement("DIV");
                    visualViewportSpace.className = visualViewportClass;
                    _Global.document.body.appendChild(visualViewportSpace);
                }
                return visualViewportSpace.getBoundingClientRect();
            },
        };

        // Mixin for WWA's Soft Keyboard offsets in IE10 mode, where -ms-device-fixed positioning is not available.
        // In that instance, all _Overlay elements fall back to using CSS fixed positioning.
        // This is for backwards compatibility with Apache Cordova Apps targeting WWA since they target IE10.
        // This is essentially the original logic for WWA _Overlay / Soft Keyboard interactions we used when windows 8 first launched.
        var _keyboardInfo_Windows8WWA_Mixin = {
            // Get the top of our visible area in terms of its absolute distance from the top of document.documentElement.
            // Normalizes any offsets which have have occured between the visual viewport and the layout viewport due to resizing the viewport to fit the IHM and/or optical zoom.
            _visibleDocTop: function _visibleDocTop_Windows8WWA() {
                return _Global.window.pageYOffset - _Global.document.documentElement.scrollTop;
            },

            // Get the bottom offset of the visual viewport from the bottom of the layout viewport, plus any IHM occlusion.
            _visibleDocBottomOffset: function _visibleDocBottomOffset_Windows8WWA() {
                return _Global.document.documentElement.clientHeight - _keyboardInfo._visibleDocBottom;
            },

            _visualViewportHeight: function _visualViewportHeight_Windows8WWA() {
                return _Global.window.innerHeight;
            },

            _visualViewportWidth: function _visualViewportWidth_Windows8WWA() {
                return _Global.window.innerWidth;
            },
        };

        // Feature detect for -ms-device-fixed positioning and fill out the
        // remainder of our WWA Soft KeyBoard handling logic with mixins.
        var visualViewportSpace = _Global.document.createElement("DIV");
        visualViewportSpace.className = visualViewportClass;
        _Global.document.body.appendChild(visualViewportSpace);

        var propertiesMixin: any,
            hasDeviceFixed = _Global.getComputedStyle(visualViewportSpace).position === "-ms-device-fixed";
        if (!hasDeviceFixed && window['Windows']) {
            // If we are in WWA with IE 10 mode, use special keyboard handling knowledge for IE10 IHM.
            propertiesMixin = _keyboardInfo_Windows8WWA_Mixin;
            _Global.document.body.removeChild(visualViewportSpace);
        } else {
            // If we are in WWA on IE 11 or outside of WWA on any web browser use general positioning logic.
            propertiesMixin = _keyboardInfo_Mixin;
        }

        for (var propertyName in propertiesMixin) {
            Object.defineProperty(_keyboardInfo, propertyName, {
                get: propertiesMixin[propertyName],
            });
        }
    }
};
_addMixin();