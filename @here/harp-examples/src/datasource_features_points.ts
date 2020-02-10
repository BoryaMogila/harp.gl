/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet, Theme } from "@here/harp-datasource-protocol";
import { LongPressHandler } from "@here/harp-map-controls";
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewLineFeature,
    MapViewMultiPointFeature,
    MapViewPointFeature,
} from "@here/harp-features-datasource";
import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken, copyrightInfo } from "../config";

/**
 * This example illustrates how to add user lines and points in [[MapView]]. As custom features,
 * they are handled through a [[FeaturesDataSource]].
 *
 * First we create a base map, but with customized theme which derives from default, but adds
 * custom [[StyleSet]] - `myStyleSet` - which will be used by datasource with our features.
 *
 * For more details, check the `hello` example.
 * ```typescript
 * [[include:harp_demo_features_linespoints_0.ts]]
 * ```
 *
 * Then we generate all the [[MapViewLineFeature]]s, with the desired text string to use for the
 * text style, straight from the data:
 * ```typescript
 * [[include:harp_demo_features_linespoints_1.ts]]
 * ```
 *
 * We also add the hotspots in the earth's mantle as a [[MapViewMultiPointFeature]].
 * ```typescript
 * [[include:harp_demo_features_linespoints_2.ts]]
 * ```
 *
 * Then we use the general [[DataSource]] mechanism: the [[FeaturesDataSource]] is created, added
 * to [[MapView]], the [[MapViewFeature]]s are added to it, and we specify [[StyleSet]] name set
 * previously in map theme.
 * ```typescript
 * [[include:harp_demo_features_linespoints_3.ts]]
 * ```
 *
 * Note how the [[StyleSet]] of this example creates the text paths out of the line features. Also,
 * we duplicate the line styles, one being a dashed line and the other a solid line, to have this
 * specific look for the ridges and trenches. The point style is also duplicated, so that a bigger
 * point is rendered below the first one, and creates an outline effect.
 */
export namespace LinesPointsFeaturesExample {
    // snippet:harp_demo_features_linespoints_0.ts
    const customizedTheme: Theme = {
        extends: "resources/berlin_tilezen_day_reduced.json",
        sky: {
            type: "gradient",
            topColor: "#898470",
            bottomColor: "#898470",
            groundColor: "#898470"
        },
        definitions: {
            northPoleColor: {
                type: "color",
                value: "#B1AC9C"
            },
            southPoleColor: {
                type: "color",
                value: "#c3bdae"
            }
        },
        styles: {
            myStyleSet: getStyleSet(),
            polar: [
                {
                    description: "North pole",
                    when: ["==", ["get", "kind"], "north_pole"],
                    technique: "fill",
                    attr: {
                        color: ["ref", "northPoleColor"]
                    },
                    renderOrder: 5
                },
                {
                    description: "South pole",
                    when: ["==", ["get", "kind"], "south_pole"],
                    technique: "fill",
                    attr: {
                        color: ["ref", "southPoleColor"]
                    },
                    renderOrder: 5
                }
            ]
        }
    };
    const map = createBaseMap(customizedTheme);
    // end:harp_demo_features_linespoints_0.ts

    // snippet:harp_demo_features_linespoints_3.ts
    // end:harp_demo_features_linespoints_3.ts
     fetch('http://localhost:5555/searchEngine/map/?superlimit=10000').then(res => res.json())
         .then((res: {items: [{ realty_id: number, latitude: number, longitude: number }]}) => {
             const items = res.items;
            const features = items.map(({ realty_id, latitude, longitude }) => new MapViewPointFeature([longitude, latitude], {
                name:'realty', type: realty_id,
                description: 'dfgdfgfdgfdgdfgfdfgdfdfgdfgfgdfgdfgdfg'
            }))
             console.log(features.length)
             const featuresDataSource = new FeaturesDataSource({
                 name: "geojson",
                 styleSetName: "myStyleSet",
                 features: features,
                 gatherFeatureIds: true,
                 gatherFeatureAttributes: true
             });
            let discardPick: boolean = false;
             map.addDataSource(featuresDataSource).then(() => {
                 map.canvas.addEventListener("click", (e: MouseEvent) => {
                     if (discardPick) {
                         return;
                     }

                     const intersectionResults = map.intersectMapObjects(e.pageX, e.pageY);
                     const usableResults = intersectionResults.filter(result => result.userData !== undefined);
                     console.log(intersectionResults, usableResults)
                 });
             });
             map.update();
         });
    const canvas = map.canvas;
    map.zoomLevel = 15.5;
    function getStyleSet(): StyleSet {
        return [

            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10001,
                attr: {
                    color: "#ca6",
                    size: 10
                }
            },
            {
                when: "description",
                technique: "text",
                renderOrder: 10001,
                attr: {
                    text: ["get", "description"],
                    color: "#ca6",
                    size: 30
                }
            },
        ];
    }

    function createBaseMap(theme: Theme): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme,
            target: new GeoCoordinates(50.45466, 30.5238),
            zoomLevel: 7,
            enableMixedLod: true
        });
        mapView.canvas.addEventListener("contextmenu", e => e.preventDefault());
        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls, { projectionSwitch: true, zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));

        const baseMap = new OmvDataSource({
            name: "basemap",
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getExampleHTML() {
        return (
            `
            <style>
                #mapCanvas {
                    top: 0;
                }
                #info{
                    color: #fff;
                    width: 80%;
                    text-align: center;
                    font-family: monospace;
                    left: 50%;
                    position: relative;
                    margin: 10px 0 0 -40%;
                    font-size: 15px;
                }
                #caption-bg{
                    display: inline-block;
                    background: rgba(255,255,255,0.8);
                    border-radius: 4px;
                    max-width:calc(100% - 150px);
                    margin: 0 10px;
                }
                #caption{
                    width: 100%;
                    position: absolute;
                    bottom: 25px;
                    text-align:center;
                    font-family: Arial;
                    color:#222;
                }
                h1{
                    font-size:15px;
                    text-transform: uppercase;
                    padding: 5px 15px;
                    display: inline-block;
                }
                @media screen and (max-width: 700px) {
                    #info{
                        font-size:11px;
                    }
                    h1{
                        padding:0px;
                        margin:5px
                    }
                }
                </style>
                <p id=info>This example demonstrates user points, lines and text paths. The text ` +
            `string is taken from the "name" property defined in the custom features. The style ` +
            `of the lines is property-based.</p>
                <div id=caption>
                    <div id=caption-bg>
                        <h1>Hotspots on Earth's mantle, with main ridges and trenches.</h1>
                    </div>
                </div>
        `
        );
    }
}
