/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { mercatorProjection, Projection, TileKey } from "@here/harp-geoutils";
import { TextCanvas } from "@here/harp-text-canvas";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { PoiRenderer } from "../lib/poi/PoiRenderer";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { ScreenProjector } from "../lib/ScreenProjector";
import { TextElement } from "../lib/text/TextElement";
import { TextElementsRenderer } from "../lib/text/TextElementsRenderer";
import { TextElementsRendererOptions } from "../lib/text/TextElementsRendererOptions";
import { TextElementType } from "../lib/text/TextElementType";
import { ViewState } from "../lib/text/ViewState";
import { Tile } from "../lib/Tile";
import { TileOffsetUtils } from "../lib/Utils";
import { DataSourceTileList } from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";
import { stubFontCatalog } from "./stubFontCatalog";
import { stubFontCatalogLoader } from "./stubFontCatalogLoader";
import { stubPoiManager } from "./stubPoiManager";
import { stubPoiRenderer, stubPoiRendererFactory } from "./stubPoiRenderer";
import { stubScreenProjector } from "./stubScreenProjector";
import { stubTextCanvas, stubTextCanvasFactory } from "./stubTextCanvas";
import { FadeState } from "./TextElementsRendererTestUtils";

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

function createViewState(worldCenter: THREE.Vector3): ViewState {
    return {
        worldCenter,
        cameraIsMoving: false,
        maxVisibilityDist: 10000,
        zoomLevel: 0,
        frameNumber: 0,
        lookAtDistance: 0,
        isDynamic: false,
        hiddenGeometryKinds: undefined,
        renderedTilesChanged: false
    };
}

type OpacityMatcher = (opacity: number) => boolean;

export const SCREEN_WIDTH = 1920;
export const SCREEN_HEIGHT = 1080;
export const DEF_TEXT_WIDTH_HEIGHT = 10;

const TILE_LEVEL = 5; // dummy arbitrary level.

/**
 * Test fixture used to test TextElementsRenderer.
 */
export class TestFixture {
    private readonly m_screenCollisions: ScreenCollisions;
    private readonly m_projection: Projection = mercatorProjection;
    private readonly tileLists: DataSourceTileList[] = [];
    private readonly m_poiRendererStub: sinon.SinonStubbedInstance<PoiRenderer>;
    private readonly m_renderPoiSpy: sinon.SinonSpy;
    private readonly m_dataSource: FakeOmvDataSource = new FakeOmvDataSource();
    private readonly m_screenProjector: ScreenProjector;
    private readonly m_camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera();
    private readonly m_theme: Theme = {};
    private m_viewState: ViewState;
    private m_options: TextElementsRendererOptions = {};
    private m_screenCollisionsIsAllocatedStub: sinon.SinonStub | undefined;
    private m_textCanvasStub: TextCanvas;
    private m_textRenderer: TextElementsRenderer | undefined;
    private m_defaultTile: Tile | undefined;
    private m_allTiles: Tile[] = [];

    constructor(readonly sandbox: sinon.SinonSandbox) {
        this.m_screenCollisions = new ScreenCollisions();
        this.m_screenCollisions.update(SCREEN_WIDTH, SCREEN_HEIGHT);
        this.m_viewState = createViewState(new THREE.Vector3());
        this.m_renderPoiSpy = sandbox.spy();
        this.m_poiRendererStub = stubPoiRenderer(this.sandbox, this.m_renderPoiSpy);
        this.m_screenProjector = stubScreenProjector(this.sandbox, SCREEN_WIDTH, SCREEN_HEIGHT);
    }

    /**
     * Sets up required before every test case.
     * @returns A promise that resolves to true once the setup is finished, to false if there was an
     * error.
     */
    setUp(): Promise<boolean> {
        this.m_defaultTile = this.m_dataSource.getTile(new TileKey(0, 0, TILE_LEVEL));
        this.m_defaultTile.textElementsChanged = true;
        this.m_allTiles = [];
        this.tileLists.push({
            dataSource: this.m_dataSource,
            zoomLevel: 0,
            storageLevel: 0,
            allVisibleTileLoaded: false,
            numTilesLoading: 0,
            visibleTiles: [this.m_defaultTile],
            renderedTiles: new Map([[1, this.m_defaultTile]])
        });
        const cameraPosition = new THREE.Vector3(0, 0, 0); // center.
        this.m_viewState = createViewState(cameraPosition);
        this.m_options = {
            labelDistanceScaleMin: 1,
            labelDistanceScaleMax: 1
        };
        const fontCatalog = stubFontCatalog(this.sandbox);
        this.m_textCanvasStub = stubTextCanvas(this.sandbox, fontCatalog, DEF_TEXT_WIDTH_HEIGHT);
        const dummyUpdateCall = () => {};
        this.m_textRenderer = new TextElementsRenderer(
            this.m_viewState,
            this.m_camera,
            dummyUpdateCall,
            this.m_screenCollisions,
            this.m_screenProjector,
            stubTextCanvasFactory(this.sandbox, this.m_textCanvasStub),
            stubPoiManager(this.sandbox),
            stubPoiRendererFactory(this.sandbox, this.m_poiRendererStub),
            stubFontCatalogLoader(this.sandbox, fontCatalog),
            this.m_theme,
            this.m_options
        );
        // Force renderer initialization by calling render with changed text elements.
        const time = 0;
        this.m_textRenderer.placeText(this.tileLists, this.m_projection, time);
        this.clearVisibleTiles();
        return this.m_textRenderer.waitInitialized();
    }

    /**
     * Checks that the fading state of a given text element has the specified expected value.
     * @param textElement The text element to verify.
     * @param expectedState The expected fading state of the text element.
     * @param prevOpacity The text element opacity in the previous frame.
     * @returns The text element opacity in the current frame.
     */
    checkTextElementState(
        textElement: TextElement,
        expectedState: FadeState,
        prevOpacity: number
    ): number {
        let newOpacity = 0;
        switch (expectedState) {
            case FadeState.FadingIn:
                newOpacity = this.checkTextElementRendered(textElement, (opacity: number) => {
                    return opacity > prevOpacity;
                });
                break;
            case FadeState.FadingOut:
                newOpacity = this.checkTextElementRendered(textElement, (opacity: number) => {
                    return opacity < prevOpacity;
                });
                break;
            case FadeState.FadedIn:
                newOpacity = this.checkTextElementRendered(textElement, (opacity: number) => {
                    return opacity === 1;
                });
                break;
            case FadeState.FadedOut:
                this.checkTextElementNotRendered(textElement);
                break;
        }
        return newOpacity;
    }

    /**
     * Adds a tile for testing that will contain the specified text elements. Tiles added this way
     * can later be referenced by index when rendering a frame. See [[renderFrame]].
     * @param elements The text elements the new tile will contain.
     */
    addTile(elements: TextElement[]) {
        const tile =
            this.m_allTiles.length > 0
                ? this.m_dataSource.getTile(
                      new TileKey(
                          this.m_allTiles[this.m_allTiles.length - 1].tileKey.row + 1,
                          0,
                          TILE_LEVEL
                      )
                  )
                : this.m_defaultTile!;
        for (const element of elements) {
            tile.addTextElement(element);
        }
        this.m_allTiles.push(tile);
    }

    /**
     * Renders text elements for a given frame.
     * @param time The time when the frame takes place.
     * @param tileIndices The indices of the tiles that will be visible in this frame.
     * @param collisionEnabled Whether label collision will be enabled in this frame.
     */
    async renderFrame(time: number, tileIndices: number[], collisionEnabled: boolean = true) {
        this.sandbox.resetHistory();
        if (collisionEnabled && this.m_screenCollisionsIsAllocatedStub !== undefined) {
            this.m_screenCollisionsIsAllocatedStub.restore();
            this.m_screenCollisionsIsAllocatedStub = undefined;
        } else if (!collisionEnabled && this.m_screenCollisionsIsAllocatedStub === undefined) {
            this.m_screenCollisionsIsAllocatedStub = (this.sandbox
                .stub(this.m_screenCollisions, "isAllocated")
                .returns(false) as unknown) as sinon.SinonStub;
        }
        if (this.textRenderer.loading) {
            await this.textRenderer.waitLoaded();
        }
        this.m_viewState.renderedTilesChanged = false;
        if (tileIndices !== undefined) {
            this.m_viewState.renderedTilesChanged = this.setVisibleTiles(tileIndices);
        }
        this.m_viewState.frameNumber++;
        this.textRenderer.placeText(this.tileLists, this.m_projection, time);
    }

    private get textRenderer(): TextElementsRenderer {
        assert(this.m_textRenderer !== undefined);
        return this.m_textRenderer!;
    }

    private checkTextElementRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        switch (textElement.type) {
            case TextElementType.PoiLabel:
                if (textElement.poiInfo !== undefined) {
                    return this.checkPoiRendered(textElement, opacityMatcher);
                } else {
                    return this.checkPointTextRendered(textElement, opacityMatcher);
                }
            case TextElementType.PathLabel:
                return this.checkPathTextRendered(textElement, opacityMatcher);
            case TextElementType.LineMarker:
                return this.checkLineMarkerRendered(textElement, opacityMatcher);
        }
    }

    private checkTextElementNotRendered(textElement: TextElement) {
        switch (textElement.type) {
            case TextElementType.PoiLabel:
                if (textElement.poiInfo !== undefined) {
                    return this.checkPoiNotRendered(textElement);
                } else {
                    return this.checkPointTextNotRendered(textElement);
                }
            case TextElementType.PathLabel:
                return this.checkPathTextNotRendered(textElement);
            case TextElementType.LineMarker:
                return this.checkLineMarkerNotRendered(textElement);
        }
    }

    private setVisibleTiles(indices: number[]): boolean {
        const newVisibleTiles = indices.map((tileIdx: number) => {
            return this.m_allTiles[tileIdx];
        });
        let changed = indices.length !== this.visibleTiles.length;
        if (!changed) {
            for (let i = 0; i < this.visibleTiles.length; ++i) {
                const oldTile = this.visibleTiles[i];
                const newTile = this.m_allTiles[indices[i]];
                if (oldTile !== newTile) {
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) {
            return false;
        }
        this.visibleTiles = newVisibleTiles;
        return true;
    }

    private clearVisibleTiles() {
        this.tileLists[0].visibleTiles.length = 0;
        this.tileLists[0].renderedTiles.clear();
    }

    private get visibleTiles(): Tile[] {
        return this.tileLists[0].visibleTiles;
    }

    private set visibleTiles(tiles: Tile[]) {
        this.tileLists[0].visibleTiles = tiles;
        this.tileLists[0].renderedTiles.clear();
        for (const tile of tiles) {
            this.tileLists[0].renderedTiles.set(
                TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, 0),
                tile
            );
        }
    }

    private checkPointTextRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        const addBufferObjStub = this.m_textCanvasStub.addTextBufferObject as sinon.SinonStub;
        const addBufferObjSpy = addBufferObjStub.withArgs(
            sinon.match.same(textElement.textBufferObject),
            sinon.match.any
        );
        assert(
            addBufferObjSpy.calledOnce,
            this.getErrorHeading(textElement) + "point text was NOT rendered."
        );
        const actualOpacity = addBufferObjSpy.firstCall.args[1].opacity;
        this.checkOpacity(actualOpacity, textElement, "text", opacityMatcher);
        return actualOpacity;
    }

    private checkPointTextNotRendered(textElement: TextElement) {
        const addBufferObjStub = this.m_textCanvasStub.addTextBufferObject as sinon.SinonStub;
        assert(
            addBufferObjStub.neverCalledWith(
                sinon.match.same(textElement.textBufferObject),
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "point text was rendered."
        );
    }

    private checkIconRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined,
        positionIndex?: number
    ): number {
        const screenCoords = this.computeScreenCoordinates(textElement, positionIndex);
        expect(screenCoords).to.exist;
        assert(
            this.m_renderPoiSpy.calledWith(
                sinon.match.same(textElement.poiInfo),
                sinon.match.any,
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "icon was NOT rendered."
        );
        const renderPoiSpy = this.m_renderPoiSpy.withArgs(
            sinon.match.same(textElement.poiInfo),
            sinon.match.array.deepEquals(screenCoords!.toArray()),
            sinon.match.any
        );
        assert(
            renderPoiSpy.called,
            this.getErrorHeading(textElement) +
                "icon was NOT rendered in expected position " +
                JSON.stringify(screenCoords)
        );
        const actualOpacity = renderPoiSpy.firstCall.args[2];
        let labelPartDescription: string = "icon";
        if (positionIndex !== undefined) {
            labelPartDescription += " " + positionIndex;
        }
        this.checkOpacity(actualOpacity, textElement, labelPartDescription, opacityMatcher);
        return actualOpacity;
    }

    private checkIconNotRendered(textElement: TextElement, positionIndex?: number) {
        const screenCoords = this.computeScreenCoordinates(textElement, positionIndex);
        expect(
            this.m_renderPoiSpy.neverCalledWith(
                sinon.match.same(textElement.poiInfo),
                sinon.match
                    .typeOf("undefined")
                    .or(sinon.match.array.deepEquals(screenCoords!.toArray())),
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "icon was rendered."
        );
    }

    private checkPoiRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        this.checkPointTextRendered(textElement, opacityMatcher);
        return this.checkIconRendered(textElement, opacityMatcher);
    }

    private checkPoiNotRendered(textElement: TextElement) {
        this.checkPointTextNotRendered(textElement);
        this.checkIconNotRendered(textElement);
    }

    private checkLineMarkerRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        let actualOpacity: number = 0;
        for (let i = 0; i < textElement.path!.length; ++i) {
            actualOpacity = this.checkIconRendered(textElement, opacityMatcher, i);
        }
        return actualOpacity;
    }

    private checkLineMarkerNotRendered(textElement: TextElement) {
        for (let i = 0; i < textElement.path!.length; ++i) {
            this.checkIconNotRendered(textElement, i);
        }
    }

    private checkPathTextRendered(
        textElement: TextElement,
        opacityMatcher: OpacityMatcher | undefined
    ): number {
        const addTextStub = this.m_textCanvasStub.addText as sinon.SinonStub;
        const addTextSpy = addTextStub.withArgs(
            sinon.match.same(textElement.glyphs),
            sinon.match.any,
            sinon.match.any
        );
        const opacitySpy = Object.getOwnPropertyDescriptor(textElement.renderStyle, "opacity")!
            .set! as sinon.SinonSpy;
        assert(opacitySpy.called, this.getErrorHeading(textElement) + "opacity not set");
        assert(
            addTextSpy.calledOnce,
            this.getErrorHeading(textElement) + "path text was NOT rendered."
        );
        const firstOpacityCallSpy = opacitySpy.firstCall;
        assert(
            firstOpacityCallSpy.calledBefore(addTextSpy.firstCall),
            this.getErrorHeading(textElement) + ", opacity not set before addText"
        );
        const actualOpacity = firstOpacityCallSpy.args[0];
        this.checkOpacity(actualOpacity, textElement, "text", opacityMatcher);
        return actualOpacity;
    }

    private checkPathTextNotRendered(textElement: TextElement) {
        const addTextStub = this.m_textCanvasStub.addText as sinon.SinonStub;
        expect(
            addTextStub.neverCalledWith(
                sinon.match.same(textElement.glyphs),
                sinon.match.any,
                sinon.match.any
            ),
            this.getErrorHeading(textElement) + "path text was rendered."
        );
    }

    private computeScreenCoordinates(
        textElement: TextElement,
        positionIndex?: number
    ): THREE.Vector2 | undefined {
        if (positionIndex !== undefined) {
            expect(textElement.path).exist;
        }
        const worldCoords =
            positionIndex !== undefined ? textElement.path![positionIndex] : textElement.position;
        return this.m_screenProjector!.project(worldCoords);
    }

    private checkOpacity(
        actualOpacity: number,
        textElement: TextElement,
        labelPartDescription: string,
        opacityMatcher: OpacityMatcher | undefined
    ) {
        const errorMessage =
            this.getErrorHeading(textElement) +
            "has wrong " +
            labelPartDescription +
            " opacity " +
            actualOpacity;
        expect(actualOpacity, errorMessage)
            .gte(0)
            .and.lte(1);
        if (opacityMatcher !== undefined) {
            assert(opacityMatcher(actualOpacity), errorMessage);
        }
    }

    private getErrorHeading(textElement: TextElement): string {
        // Substract first initialization frame and 1 more because the view state holds the number
        // of the next frame.
        const currentFrame = this.m_viewState.frameNumber - 2;
        return "Frame " + currentFrame + ", label '" + textElement.text + "': ";
    }
}
