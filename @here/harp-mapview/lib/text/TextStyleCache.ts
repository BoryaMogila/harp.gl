/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ColorUtils,
    Expr,
    getPropertyValue,
    IndexedTechniqueParams,
    LineMarkerTechnique,
    PoiTechnique,
    Technique,
    TextStyleDefinition,
    TextTechnique,
    Theme
} from "@here/harp-datasource-protocol";
import {
    DefaultTextStyle,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import { ColorCache } from "../ColorCache";
import { evaluateColorProperty } from "../DecodedTileHelpers";
import { PoiRenderer } from "../poi/PoiRenderer";
import { Tile } from "../Tile";
import { TextCanvasRenderer } from "./TextCanvasRenderer";

const logger = LoggerManager.instance.create("TextStyleCache");

/**
 * [[TextStyle]] id for the default value inside a [[TextRenderStyleCache]] or a
 * [[TextLayoutStyleCache]].
 */
export const DEFAULT_TEXT_STYLE_CACHE_ID = "Default";

/**
 * Calculates the [[TextStyle]] id that identifies either a [[TextRenderStyle]] or a
 * [[TextLayoutStyle]] inside a [[TextRenderStyleCache]] or a [[TextLayoutStyleCache]],
 * respectively.
 *
 * @param technique Technique defining the [[TextStyle]].
 * @param zoomLevel Zoom level for which to interpret the technique.
 *
 * @returns [[TextStyle]] id.
 */
export function computeStyleCacheId(
    datasourceName: string,
    technique: Technique & Partial<IndexedTechniqueParams>,
    zoomLevel: number
): string {
    return `${datasourceName}_${technique._key}_${zoomLevel}`;
}

/**
 * Cache storing [[MapView]]'s [[TextRenderStyle]]s.
 */
export class TextRenderStyleCache {
    private m_map: Map<string, TextRenderStyle> = new Map();
    constructor() {
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextRenderStyle({
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: 8
                },
                color: ColorCache.instance.getColor("#6d7477"),
                opacity: 1.0,
                backgroundColor: ColorCache.instance.getColor("#f7fbfd"),
                backgroundOpacity: 0.5
            })
        );
    }

    get size(): number {
        return this.m_map.size;
    }

    get(id: string): TextRenderStyle | undefined {
        return this.m_map.get(id);
    }

    set(id: string, value: TextRenderStyle): void {
        this.m_map.set(id, value);
    }

    clear(): void {
        this.m_map.clear();
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextRenderStyle({
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: 8
                },
                color: ColorCache.instance.getColor("#6d7477"),
                opacity: 1.0,
                backgroundColor: ColorCache.instance.getColor("#f7fbfd"),
                backgroundOpacity: 0.5
            })
        );
    }
}

/**
 * Cache storing [[MapView]]'s [[TextLayoutStyle]]s.
 */
export class TextLayoutStyleCache {
    private m_map: Map<string, TextLayoutStyle> = new Map();
    constructor() {
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Center,
                horizontalAlignment: HorizontalAlignment.Center
            })
        );
    }

    get size(): number {
        return this.m_map.size;
    }

    get(id: string): TextLayoutStyle | undefined {
        return this.m_map.get(id);
    }

    set(id: string, value: TextLayoutStyle): void {
        this.m_map.set(id, value);
    }

    clear(): void {
        this.m_map.clear();
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Center,
                horizontalAlignment: HorizontalAlignment.Center
            })
        );
    }
}

const DEFAULT_STYLE_NAME = "default";

/**
 * [[TextElementsRenderer]] representation of a [[Theme]]'s TextStyle.
 */
export interface TextElementStyle {
    name: string;
    fontCatalog: string;
    renderParams: TextRenderParameters;
    layoutParams: TextLayoutParameters;
    textCanvas?: TextCanvas;
    poiRenderer?: PoiRenderer;
}

export class TextStyleCache {
    private m_textRenderStyleCache = new TextRenderStyleCache();
    private m_textLayoutStyleCache = new TextLayoutStyleCache();
    /**
     * Cache for named colors.
     */
    private m_colorMap: Map<string, THREE.Color> = new Map();

    private m_textStyles: Map<string, TextElementStyle> = new Map();
    private m_defaultStyle: TextElementStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalog: "",
        renderParams: this.m_textRenderStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params,
        layoutParams: this.m_textLayoutStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params
    };

    constructor(private m_theme: Theme) {}

    initializeDefaultTextElementStyle(defaultFontCatalogName: string) {
        if (this.m_theme.textStyles === undefined) {
            this.m_theme.textStyles = [];
        }
        const styles = this.m_theme.textStyles;

        const themedDefaultStyle = styles.find(style => style.name === DEFAULT_STYLE_NAME);
        if (themedDefaultStyle !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                themedDefaultStyle,
                DEFAULT_STYLE_NAME
            );
        } else if (this.m_theme.defaultTextStyle !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                this.m_theme.defaultTextStyle,
                DEFAULT_STYLE_NAME
            );
        } else if (styles.length > 0) {
            this.m_defaultStyle = this.createTextElementStyle(styles[0], DEFAULT_STYLE_NAME);
        }
        this.m_defaultStyle.fontCatalog = defaultFontCatalogName;
    }

    initializeTextElementStyles(
        defaultPoiRenderer: PoiRenderer,
        defaultTextCanvas: TextCanvas,
        textRenderers: TextCanvasRenderer[]
    ) {
        // Initialize default text style.
        if (this.m_defaultStyle.fontCatalog !== undefined) {
            const styledTextRenderer = textRenderers.find(
                textRenderer => textRenderer.fontCatalog === this.m_defaultStyle.fontCatalog
            );
            this.m_defaultStyle.textCanvas =
                styledTextRenderer !== undefined ? styledTextRenderer.textCanvas : undefined;
            this.m_defaultStyle.poiRenderer =
                styledTextRenderer !== undefined ? styledTextRenderer.poiRenderer : undefined;
        }
        if (this.m_defaultStyle.textCanvas === undefined) {
            if (this.m_defaultStyle.fontCatalog !== undefined) {
                logger.warn(
                    `FontCatalog '${this.m_defaultStyle.fontCatalog}' set in TextStyle '${
                        this.m_defaultStyle.name
                    }' not found, using default fontCatalog(${
                        defaultTextCanvas!.fontCatalog.name
                    }).`
                );
            }
            this.m_defaultStyle.textCanvas = defaultTextCanvas;
            this.m_defaultStyle.poiRenderer = defaultPoiRenderer;
        }

        // Initialize theme text styles.
        this.m_theme.textStyles!.forEach(element => {
            this.m_textStyles.set(
                element.name!,
                this.createTextElementStyle(element, element.name!)
            );
        });
        // tslint:disable-next-line:no-unused-variable
        for (const [, style] of this.m_textStyles) {
            if (style.textCanvas === undefined) {
                if (style.fontCatalog !== undefined) {
                    const styledTextRenderer = textRenderers.find(
                        textRenderer => textRenderer.fontCatalog === style.fontCatalog
                    );
                    style.textCanvas =
                        styledTextRenderer !== undefined
                            ? styledTextRenderer.textCanvas
                            : undefined;
                    style.poiRenderer =
                        styledTextRenderer !== undefined
                            ? styledTextRenderer.poiRenderer
                            : undefined;
                }
                if (style.textCanvas === undefined) {
                    if (style.fontCatalog !== undefined) {
                        logger.warn(
                            `FontCatalog '${style.fontCatalog}' set in TextStyle '${
                                style.name
                            }' not found, using default fontCatalog(${
                                defaultTextCanvas!.fontCatalog.name
                            }).`
                        );
                    }
                    style.textCanvas = defaultTextCanvas;
                    style.poiRenderer = defaultPoiRenderer;
                }
            }
        }
    }

    /**
     * Retrieves a [[TextElementStyle]] for [[Theme]]'s [[TextStyle]] id.
     */
    getTextElementStyle(styleId?: string): TextElementStyle {
        let result;
        if (styleId === undefined) {
            result = this.m_defaultStyle;
        } else {
            result = this.m_textStyles.get(styleId);
            if (result === undefined) {
                result = this.m_defaultStyle;
            }
        }
        return result;
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param technique Label's technique.
     * @param techniqueIdx Label's technique index.
     */
    getRenderStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextRenderStyle {
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const zoomLevel = mapView.zoomLevel;
        const zoomLevelInt = Math.floor(zoomLevel);

        const cacheId = computeStyleCacheId(dataSource.name, technique, zoomLevelInt);
        let renderStyle = this.m_textRenderStyleCache.get(cacheId);
        if (renderStyle === undefined) {
            const defaultRenderParams = this.m_defaultStyle.renderParams;

            // Sets opacity to 1.0 if default and technique attribute are undefined.
            const defaultOpacity = getOptionValue(defaultRenderParams.opacity, 1.0);
            // Interpolate opacity but only on discreet zoom levels (step interpolation).
            let opacity = getPropertyValue(
                getOptionValue(technique.opacity, defaultOpacity),
                zoomLevelInt
            );

            // Store color (RGB) in cache and multiply opacity value with the color alpha channel.
            if (technique.color !== undefined) {
                let hexColor = evaluateColorProperty(technique.color, zoomLevelInt);
                if (ColorUtils.hasAlphaInHex(hexColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexColor);
                    opacity = opacity * alpha;
                    hexColor = ColorUtils.removeAlphaFromHex(hexColor);
                }
                this.m_colorMap.set(cacheId, ColorCache.instance.getColor(hexColor));
            }

            // Sets background size to 0.0 if default and technique attribute is undefined.
            const defaultBackgroundSize = getOptionValue(
                defaultRenderParams.fontSize!.backgroundSize,
                0
            );
            const backgroundSize = getPropertyValue(
                getOptionValue(technique.backgroundSize, defaultBackgroundSize),
                zoomLevelInt
            );

            const hasBackgroundDefined =
                technique.backgroundColor !== undefined &&
                technique.backgroundSize !== undefined &&
                backgroundSize > 0;

            // Sets background opacity to 1.0 if default and technique value is undefined while
            // background size and color is specified, otherwise set value in default render
            // params or 0.0 if neither set. Makes label opaque when backgroundColor and
            // backgroundSize are set.
            const defaultBackgroundOpacity = getOptionValue(
                defaultRenderParams.backgroundOpacity,
                0.0
            );
            let backgroundOpacity = getPropertyValue(
                getOptionValue(
                    technique.backgroundOpacity,
                    hasBackgroundDefined ? 1.0 : defaultBackgroundOpacity
                ),
                zoomLevelInt
            );

            // Store background color (RGB) in cache and multiply backgroundOpacity by its alpha.
            if (technique.backgroundColor !== undefined) {
                let hexBgColor = evaluateColorProperty(technique.backgroundColor, zoomLevelInt);
                if (ColorUtils.hasAlphaInHex(hexBgColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexBgColor);
                    backgroundOpacity = backgroundOpacity * alpha;
                    hexBgColor = ColorUtils.removeAlphaFromHex(hexBgColor);
                }
                this.m_colorMap.set(cacheId + "_bg", ColorCache.instance.getColor(hexBgColor));
            }

            const renderParams = {
                fontName: getOptionValue(technique.fontName, defaultRenderParams.fontName),
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: getPropertyValue(
                        getOptionValue(technique.size, defaultRenderParams.fontSize!.size),
                        zoomLevelInt
                    ),
                    backgroundSize
                },
                fontStyle:
                    technique.fontStyle === "Regular" ||
                    technique.fontStyle === "Bold" ||
                    technique.fontStyle === "Italic" ||
                    technique.fontStyle === "BoldItalic"
                        ? FontStyle[technique.fontStyle]
                        : defaultRenderParams.fontStyle,
                fontVariant:
                    technique.fontVariant === "Regular" ||
                    technique.fontVariant === "AllCaps" ||
                    technique.fontVariant === "SmallCaps"
                        ? FontVariant[technique.fontVariant]
                        : defaultRenderParams.fontVariant,
                rotation: getOptionValue(technique.rotation, defaultRenderParams.rotation),
                color: getOptionValue(
                    this.m_colorMap.get(cacheId),
                    getOptionValue(defaultRenderParams.color, DefaultTextStyle.DEFAULT_COLOR)
                ),
                backgroundColor: getOptionValue(
                    this.m_colorMap.get(cacheId + "_bg"),
                    getOptionValue(
                        defaultRenderParams.backgroundColor,
                        DefaultTextStyle.DEFAULT_BACKGROUND_COLOR
                    )
                ),
                opacity,
                backgroundOpacity
            };

            const themeRenderParams = this.getTextElementStyle(technique.style).renderParams;
            renderStyle = new TextRenderStyle({
                ...themeRenderParams,
                ...renderParams
            });
            this.m_textRenderStyleCache.set(cacheId, renderStyle);

            if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
                tile.addUpdater(() => {
                    let colorHex = evaluateColorProperty(technique.color!, mapView.zoomLevel);
                    let opacity2 = getPropertyValue(technique.opacity, mapView.zoomLevel) || 1;

                    if (ColorUtils.hasAlphaInHex(colorHex)) {
                        const alpha = ColorUtils.getAlphaFromHex(colorHex);
                        opacity2 = opacity2 * alpha;
                        colorHex = ColorUtils.removeAlphaFromHex(colorHex);
                    }
                    renderStyle!.color.set(colorHex);
                    renderStyle!.opacity = opacity2;
                });
            }

            if (
                Expr.isExpr(technique.backgroundColor) ||
                Expr.isExpr(technique.backgroundOpacity)
            ) {
                tile.addUpdater(() => {
                    let colorHex = evaluateColorProperty(
                        technique.backgroundColor!,
                        mapView.zoomLevel
                    );
                    let opacity2 =
                        getPropertyValue(technique.backgroundOpacity, mapView.zoomLevel) || 1;

                    if (ColorUtils.hasAlphaInHex(colorHex)) {
                        const alpha = ColorUtils.getAlphaFromHex(colorHex);
                        opacity2 = opacity2 * alpha;
                        colorHex = ColorUtils.removeAlphaFromHex(colorHex);
                    }
                    renderStyle!.backgroundColor.set(colorHex);
                    renderStyle!.backgroundOpacity = opacity2;
                });
            }
            if (Expr.isExpr(technique.size)) {
                tile.addUpdater(() => {
                    const size2 = getPropertyValue(technique.size, mapView.zoomLevel);

                    renderStyle!.fontSize.size = size2;
                });
            }
        }

        return renderStyle;
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param tile The [[Tile]] to process.
     * @param technique Label's technique.
     */
    getLayoutStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const floorZoomLevel = Math.floor(tile.mapView.zoomLevel);
        const cacheId = computeStyleCacheId(tile.dataSource.name, technique, floorZoomLevel);
        let layoutStyle = this.m_textLayoutStyleCache.get(cacheId);

        if (layoutStyle === undefined) {
            const defaultLayoutParams = this.m_defaultStyle.layoutParams;

            const hAlignment = getPropertyValue(technique.hAlignment, floorZoomLevel) as
                | string
                | undefined;
            const vAlignment = getPropertyValue(technique.vAlignment, floorZoomLevel) as
                | string
                | undefined;
            const wrapping = getPropertyValue(technique.wrappingMode, floorZoomLevel) as
                | string
                | undefined;

            const horizontalAlignment: HorizontalAlignment | undefined =
                hAlignment === "Left" || hAlignment === "Center" || hAlignment === "Right"
                    ? HorizontalAlignment[hAlignment]
                    : defaultLayoutParams.horizontalAlignment;

            const verticalAlignment: VerticalAlignment | undefined =
                vAlignment === "Above" || vAlignment === "Center" || vAlignment === "Below"
                    ? VerticalAlignment[vAlignment]
                    : defaultLayoutParams.verticalAlignment;

            const layoutParams = {
                tracking:
                    getPropertyValue(technique.tracking, floorZoomLevel) ??
                    defaultLayoutParams.tracking,
                leading:
                    getPropertyValue(technique.leading, floorZoomLevel) ??
                    defaultLayoutParams.leading,
                maxLines:
                    getPropertyValue(technique.maxLines, floorZoomLevel) ??
                    defaultLayoutParams.maxLines,
                lineWidth:
                    getPropertyValue(technique.lineWidth, floorZoomLevel) ??
                    defaultLayoutParams.lineWidth,
                canvasRotation:
                    getPropertyValue(technique.canvasRotation, floorZoomLevel) ??
                    defaultLayoutParams.canvasRotation,
                lineRotation:
                    getPropertyValue(technique.lineRotation, floorZoomLevel) ??
                    defaultLayoutParams.lineRotation,
                wrappingMode:
                    wrapping === "None" || wrapping === "Character" || wrapping === "Word"
                        ? WrappingMode[wrapping]
                        : defaultLayoutParams.wrappingMode,
                horizontalAlignment,
                verticalAlignment
            };

            const themeLayoutParams = this.getTextElementStyle(technique.style);
            layoutStyle = new TextLayoutStyle({
                ...themeLayoutParams,
                ...layoutParams
            });
            this.m_textLayoutStyleCache.set(cacheId, layoutStyle);
        }

        return layoutStyle;
    }

    private createTextElementStyle(
        style: TextStyleDefinition,
        styleName: string
    ): TextElementStyle {
        return {
            name: styleName,
            fontCatalog: getOptionValue(style.fontCatalogName, this.m_defaultStyle.fontCatalog),
            renderParams: {
                fontName: style.fontName,
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: style.backgroundSize || 8
                },
                fontStyle:
                    style.fontStyle === "Regular" ||
                    style.fontStyle === "Bold" ||
                    style.fontStyle === "Italic" ||
                    style.fontStyle === "BoldItalic"
                        ? FontStyle[style.fontStyle]
                        : undefined,
                fontVariant:
                    style.fontVariant === "Regular" ||
                    style.fontVariant === "AllCaps" ||
                    style.fontVariant === "SmallCaps"
                        ? FontVariant[style.fontVariant]
                        : undefined,
                rotation: style.rotation,
                color:
                    style.color !== undefined
                        ? ColorCache.instance.getColor(style.color)
                        : undefined,
                backgroundColor:
                    style.backgroundColor !== undefined
                        ? ColorCache.instance.getColor(style.backgroundColor)
                        : undefined,
                opacity: style.opacity,
                backgroundOpacity: style.backgroundOpacity
            },
            layoutParams: {
                tracking: style.tracking,
                leading: style.leading,
                maxLines: style.maxLines,
                lineWidth: style.lineWidth,
                canvasRotation: style.canvasRotation,
                lineRotation: style.lineRotation,
                wrappingMode:
                    style.wrappingMode === "None" ||
                    style.wrappingMode === "Character" ||
                    style.wrappingMode === "Word"
                        ? WrappingMode[style.wrappingMode]
                        : WrappingMode.Word,
                verticalAlignment:
                    style.vAlignment === "Above" ||
                    style.vAlignment === "Center" ||
                    style.vAlignment === "Below"
                        ? VerticalAlignment[style.vAlignment]
                        : VerticalAlignment.Center,
                horizontalAlignment:
                    style.hAlignment === "Left" ||
                    style.hAlignment === "Center" ||
                    style.hAlignment === "Right"
                        ? HorizontalAlignment[style.hAlignment]
                        : HorizontalAlignment.Center
            }
        };
    }
}
