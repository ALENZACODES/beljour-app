export const CATALOGUE = {
    "format": "beljour-filter/1",
    "recipes": [
        {
            "id": "C01",
            "name": "Deauville",
            "version": 2,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 1,
            "like": {
                "score": 5,
                "source": "report#9",
                "reason": "Most-used family in the source app; gentle default keeps skin natural"
            },
            "description": "Crisp contrast, cool blue highlights and background",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.158
                            ],
                            [
                                0.5,
                                0.485
                            ],
                            [
                                0.75,
                                0.735
                            ],
                            [
                                1,
                                0.923
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.188
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.75,
                                0.796
                            ],
                            [
                                1,
                                0.985
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.031
                            ],
                            [
                                0.25,
                                0.219
                            ],
                            [
                                0.5,
                                0.531
                            ],
                            [
                                0.75,
                                0.86
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.387,
                        "inner": 0.4,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#9"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C02",
            "name": "Biarritz",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 6,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Warm, lively before/after on any skin tone"
            },
            "description": "Rich warm colour with a soft highlight glow, with muted colour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": 0.6038,
                                "light": 0.483
                            },
                            "orange": {
                                "chroma": 0.6038,
                                "light": 0.6038
                            },
                            "yellow": {
                                "chroma": 0.7245,
                                "light": 0.483
                            },
                            "green": {
                                "hue": 1.05,
                                "chroma": -0.2415
                            },
                            "aqua": {
                                "hue": 1.05
                            },
                            "blue": {
                                "hue": 1.05,
                                "chroma": 0.2415
                            }
                        }
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.483
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.2898,
                        "threshold": 0.75,
                        "radius": 0.02,
                        "warmth": 0.7245
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.3675
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C03",
            "name": "Giverny",
            "version": 3,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 7,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Background colour changes, face stays herself"
            },
            "description": "Airy and bright; blues and greens lifted, with more contrast; darker corners",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.1764
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": -0.3675
                            },
                            "green": {
                                "chroma": 0.441
                            },
                            "aqua": {
                                "chroma": 0.441
                            },
                            "blue": {
                                "chroma": 0.441
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.294
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.4725,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C05",
            "name": "Menton",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 8,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Subtle everyday warmth"
            },
            "description": "Sunny, slightly faded warmth, with muted colour",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2903
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 70.0,
                        "amount": 0.0405
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.2903
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.6075,
                        "highlights": 0.0
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.27
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C06",
            "name": "Honfleur",
            "version": 2,
            "class": 1,
            "tab": "Vintage",
            "status": "Build",
            "round": "FX1",
            "rank": 9,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Wearable nostalgia, no harsh shadows"
            },
            "description": "Faded warm print with lifted blacks",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.575
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.15
                            ],
                            [
                                0.5,
                                0.569
                            ],
                            [
                                1,
                                0.942
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.115
                            ],
                            [
                                0.5,
                                0.488
                            ],
                            [
                                1,
                                0.873
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.081
                            ],
                            [
                                0.5,
                                0.396
                            ],
                            [
                                1,
                                0.77
                            ]
                        ]
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.7,
                        "inner": 0.75,
                        "outer": 1.0
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C07",
            "name": "Étretat",
            "version": 3,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 10,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Creamy mood without smoothing her skin"
            },
            "description": "Airy lilac mist with lifted blacks; more contrast",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.126
                            ],
                            [
                                0.3,
                                0.318
                            ],
                            [
                                0.55,
                                0.546
                            ],
                            [
                                0.72,
                                0.747
                            ],
                            [
                                0.86,
                                0.932
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.108
                            ],
                            [
                                0.3,
                                0.291
                            ],
                            [
                                0.55,
                                0.532
                            ],
                            [
                                0.72,
                                0.702
                            ],
                            [
                                0.86,
                                0.824
                            ],
                            [
                                1,
                                0.928
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.153
                            ],
                            [
                                0.3,
                                0.345
                            ],
                            [
                                0.55,
                                0.55
                            ],
                            [
                                0.72,
                                0.756
                            ],
                            [
                                0.86,
                                0.941
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.144
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.3
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C08",
            "name": "Èze",
            "version": 3,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 11,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Best daily default: 'still me, best day'"
            },
            "description": "Light polish, with a brighter exposure",
            "editorial": {
                "family": "Masthead",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "id": "expo",
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.1764
                    }
                },
                {
                    "id": "contrast",
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.0936
                    }
                },
                {
                    "id": "sat",
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.0708
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.3444
                    }
                }
            ],
            "presets": [
                {
                    "name": "Glass Bloom",
                    "patch": {
                        "expo": {
                            "ev": 0.22
                        },
                        "contrast": {
                            "amount": -0.14
                        },
                        "sat": {
                            "amount": 0.02
                        }
                    },
                    "append": [
                        {
                            "op": "colour.curve",
                            "params": {
                                "master": [
                                    [
                                        0,
                                        0.02
                                    ],
                                    [
                                        0.22,
                                        0.24
                                    ],
                                    [
                                        0.62,
                                        0.64
                                    ],
                                    [
                                        1,
                                        0.985
                                    ]
                                ]
                            }
                        },
                        {
                            "op": "colour.highlightRolloff",
                            "params": {
                                "amount": 0.24,
                                "knee": 0.72,
                                "chroma": -0.06
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C09",
            "name": "Provence",
            "version": 2,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 12,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft light, no reshaping"
            },
            "description": "Soft pastel light, with a deeper exposure",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": -0.42
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": -0.1155
                            },
                            "orange": {
                                "chroma": -0.1733
                            },
                            "yellow": {
                                "chroma": -0.231,
                                "hue": 1.05
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.1386
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.5775,
                        "knee": 0.7
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.3465
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C102",
            "name": "Sceaux",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 13,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Ivory light"
            },
            "description": "Ivory highlights, soft contrast, with a deeper exposure",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 90,
                        "highlightAmount": 0.042,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.189
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.315,
                        "knee": 0.7
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.315
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C103",
            "name": "Senlis",
            "version": 3,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 14,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Clean white"
            },
            "description": "Clean whites, her skin tone neutral, muted colour; softer, deeper",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.455,
                        "knee": 0.7,
                        "chroma": -0.7
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0,
                        "highlights": 0.364
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.245
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.25
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.3
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C105",
            "name": "Chatou",
            "version": 2,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 15,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft focus"
            },
            "description": "Bright pearl high-key with a soft glow",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.04
                            ],
                            [
                                0.5,
                                0.579
                            ],
                            [
                                0.8,
                                0.932
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.04
                            ],
                            [
                                0.5,
                                0.579
                            ],
                            [
                                0.8,
                                0.932
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.04
                            ],
                            [
                                0.5,
                                0.579
                            ],
                            [
                                0.8,
                                0.932
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.36
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.792,
                        "threshold": 0.6,
                        "radius": 0.03,
                        "warmth": 0.198
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [],
                "concepts": [
                    "OKLab",
                    "Orton soft focus"
                ]
            }
        },
        {
            "id": "C106",
            "name": "Bougival",
            "version": 3,
            "class": 1,
            "tab": "Film-style",
            "status": "Build",
            "round": "FX1",
            "rank": 16,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Pearl"
            },
            "description": "Pearly highlight glow, softer contrast, cross-processed colour",
            "editorial": {
                "family": "Salon Suite",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.1296,
                        "threshold": 0.78,
                        "radius": 0.02,
                        "warmth": -0.0648
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 320,
                        "highlightAmount": 0.0081,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.27
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "b": [
                            [
                                0,
                                0.0648
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.838
                            ]
                        ],
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.3,
                                0.246
                            ],
                            [
                                0.7,
                                0.781
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab",
                    "Orton soft focus"
                ]
            }
        },
        {
            "id": "C107",
            "name": "Croissy",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 17,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Warm light"
            },
            "description": "Warm white balance, soft, with a matte finish",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 1
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.24
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.48,
                        "highlights": 0
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.3,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C14",
            "name": "Lyon",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 18,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Safe warm look for every skin tone"
            },
            "description": "Gentle warmth, with more contrast",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.6038
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2898
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.7245,
                        "highlights": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C16",
            "name": "Antibes",
            "version": 3,
            "class": 1,
            "tab": "Cool",
            "status": "Build",
            "round": "FX1",
            "rank": 19,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Holiday look that keeps the face natural"
            },
            "description": "Blue water, warm light, with a deeper exposure; darker corners",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "blue": {
                                "chroma": 0.4725,
                                "light": -0.1323
                            },
                            "aqua": {
                                "chroma": 0.3675,
                                "light": -0.0882
                            }
                        }
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 220.0,
                        "shadowAmount": 0.0315,
                        "highlightHue": 58,
                        "highlightAmount": 0.0315,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.378
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.63,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C26",
            "name": "Colmar",
            "version": 2,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 20,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Lively without shape edits"
            },
            "description": "Lively colour boost",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.64
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.04
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.3,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.25
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C28",
            "name": "Fontainebleau",
            "version": 2,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 21,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Complexion untouched by design"
            },
            "description": "Warm look, skin kept as it is, with more contrast and a brighter exposure",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": true,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": 0.2625
                            },
                            "orange": {
                                "chroma": 0.3675
                            },
                            "yellow": {
                                "chroma": 0.3675
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.2625
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2625
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C30",
            "name": "Périgord",
            "version": 3,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 22,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Golden-hour glow is widely loved"
            },
            "description": "Matte amber film, lifted warm blacks, soft glow; more contrast",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.145
                            ],
                            [
                                0.5,
                                0.545
                            ],
                            [
                                0.8,
                                0.892
                            ],
                            [
                                1,
                                0.965
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.127
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.8,
                                0.8
                            ],
                            [
                                1,
                                0.885
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.081
                            ],
                            [
                                0.5,
                                0.43
                            ],
                            [
                                0.8,
                                0.639
                            ],
                            [
                                1,
                                0.7
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.25
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.4,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0.2
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2
                    }
                }
            ],
            "presets": [
                {
                    "name": "Golden Vinyl",
                    "append": [
                        {
                            "op": "colour.curve",
                            "params": {
                                "master": [
                                    [
                                        0,
                                        0.03
                                    ],
                                    [
                                        0.2,
                                        0.205
                                    ],
                                    [
                                        0.8,
                                        0.795
                                    ],
                                    [
                                        1,
                                        0.97
                                    ]
                                ]
                            }
                        },
                        {
                            "op": "colour.fade",
                            "params": {
                                "amount": 0.05,
                                "toneAmount": 0.025,
                                "toneHue": 38
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C38",
            "name": "Camargue",
            "version": 2,
            "class": 1,
            "tab": "Fade",
            "status": "Build",
            "round": "FX1",
            "rank": 23,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Gentle and versatile"
            },
            "description": "Matte finish, with a deeper exposure",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.36,
                        "toneHue": 0,
                        "toneAmount": 0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.16
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.3
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C39",
            "name": "Talloires",
            "version": 3,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 24,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft-focus portrait with her skin protected"
            },
            "description": "Soft-focus portrait, slightly cool, skin kept; more contrast, brighter",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": true,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.756
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.756,
                        "threshold": 0.55,
                        "radius": 0.035,
                        "warmth": -1
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2625
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#10"
                ],
                "concepts": [
                    "OKLab",
                    "Orton soft focus"
                ]
            }
        },
        {
            "id": "C40",
            "name": "Uzès",
            "version": 2,
            "class": 1,
            "tab": "Fade",
            "status": "Build",
            "round": "FX1",
            "rank": 25,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Warm diffusion without changing her"
            },
            "description": "Moody rose: darker mids, warm bloom",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.449
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.12
                            ],
                            [
                                0.5,
                                0.535
                            ],
                            [
                                0.8,
                                0.875
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.075
                            ],
                            [
                                0.5,
                                0.49
                            ],
                            [
                                0.8,
                                0.71
                            ],
                            [
                                1,
                                0.851
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.12
                            ],
                            [
                                0.5,
                                0.47
                            ],
                            [
                                0.8,
                                0.8
                            ],
                            [
                                1,
                                0.925
                            ]
                        ]
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.822,
                        "threshold": 0.6,
                        "radius": 0.035,
                        "warmth": 0.3
                    }
                }
            ],
            "presets": [
                {
                    "name": "Framed",
                    "append": [
                        {
                            "op": "light.vignette",
                            "params": {
                                "amount": 0.4,
                                "inner": 0.35,
                                "outer": 1.0
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab",
                    "Orton soft focus"
                ]
            }
        },
        {
            "id": "C41",
            "name": "Conques",
            "version": 2,
            "class": 1,
            "tab": "Classic",
            "status": "Build",
            "round": "FX1",
            "rank": 26,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Puts attention on her face"
            },
            "description": "Light drawn to the face, with a deeper exposure",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": true,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "light.centre",
                    "params": {
                        "amount": 1,
                        "warmth": 0.0,
                        "radius": 0.45,
                        "follow": 1
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.78,
                        "inner": 0.35,
                        "outer": 1
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.45
                    }
                }
            ],
            "presets": [
                {
                    "name": "Rosé",
                    "append": [
                        {
                            "op": "colour.tint",
                            "params": {
                                "hue": 10,
                                "amount": 0.025
                            }
                        },
                        {
                            "op": "light.border",
                            "params": {
                                "amount": 0.35,
                                "width": 0.065,
                                "tone": -1
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C50",
            "name": "Arcachon",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 27,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Warm and kind"
            },
            "description": "Honey mids, gentle gold highlights, low contrast, with darker corners",
            "editorial": {
                "family": "Editorial Day",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 75,
                        "amount": 0.015
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 85,
                        "highlightAmount": 0.015,
                        "balance": 0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.072
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.45,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C53",
            "name": "Granville",
            "version": 3,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 28,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "True colour"
            },
            "description": "True colour, half the cast removed; cooler and brighter; richer colour",
            "editorial": {
                "family": "Masthead",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.greyWorld",
                    "params": {
                        "amount": 1
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.4158
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.3465
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2888
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.21
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab",
                    "grey-world white balance"
                ]
            }
        },
        {
            "id": "C54",
            "name": "Dinard",
            "version": 2,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 29,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Fresh"
            },
            "description": "A little brighter, livelier, cleaner greens, with a matte finish",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.42
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.525
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "green": {
                                "chroma": 0.63,
                                "hue": 1.05
                            }
                        }
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.315,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C55",
            "name": "Bréhat",
            "version": 2,
            "class": 1,
            "tab": "Natural",
            "status": "Build",
            "round": "FX1",
            "rank": 30,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft daylight"
            },
            "description": "Soft highlights, open shadows, neutral colour, with a cooler cast",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 1,
                        "knee": 0.65
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 1,
                        "highlights": 0.0
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.45
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C63",
            "name": "Chenonceau",
            "version": 2,
            "class": 1,
            "tab": "Film-style",
            "status": "Build",
            "round": "FX1",
            "rank": 31,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft portrait classic"
            },
            "description": "Low contrast, highlight glow; brighter, cross-processed colour",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.462
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.3465,
                        "threshold": 0.72,
                        "radius": 0.025,
                        "warmth": 0.0
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2888
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "b": [
                            [
                                0,
                                0.0556
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.8614
                            ]
                        ],
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.3,
                                0.2538
                            ],
                            [
                                0.7,
                                0.7693
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab",
                    "Orton soft focus"
                ]
            }
        },
        {
            "id": "C77",
            "name": "Villefranche",
            "version": 3,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 32,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Flattering peach light"
            },
            "description": "Peach highlights, muted colour, brighter; darker corners",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "id": "split",
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 48,
                        "highlightAmount": 0.12,
                        "balance": -0.24
                    }
                },
                {
                    "id": "expo",
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2592
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.6
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.54
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.54,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [
                {
                    "name": "Lilac Air",
                    "patch": {
                        "split": {
                            "shadowHue": 260,
                            "shadowAmount": 0.012,
                            "highlightHue": 314,
                            "highlightAmount": 0.028,
                            "balance": -0.08
                        },
                        "expo": {
                            "ev": 0.08
                        }
                    },
                    "append": [
                        {
                            "op": "colour.curve",
                            "params": {
                                "master": [
                                    [
                                        0,
                                        0.03
                                    ],
                                    [
                                        0.32,
                                        0.34
                                    ],
                                    [
                                        0.7,
                                        0.72
                                    ],
                                    [
                                        1,
                                        0.99
                                    ]
                                ]
                            }
                        },
                        {
                            "op": "colour.saturation",
                            "params": {
                                "amount": 0.04
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C93",
            "name": "Palavas",
            "version": 2,
            "class": 1,
            "tab": "Film-style",
            "status": "Build",
            "round": "FX1",
            "rank": 33,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Made for faces"
            },
            "description": "Portrait film: soft contrast, warm mids, with a warmer cast",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    },
                    {
                        "id": "grain",
                        "amount": 15
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "id": "curve",
                    "op": "colour.curve",
                    "params": {
                        "master": [
                            [
                                0,
                                0.039
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.961
                            ]
                        ]
                    }
                },
                {
                    "id": "contrast",
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.195
                    }
                },
                {
                    "id": "tint",
                    "op": "colour.tint",
                    "params": {
                        "hue": 65,
                        "amount": 0.019
                    }
                },
                {
                    "id": "roll",
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.39,
                        "knee": 0.7
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.3
                    }
                }
            ],
            "presets": [
                {
                    "name": "Midnight Gloss",
                    "patch": {
                        "curve": {
                            "master": [
                                [
                                    0,
                                    0.035
                                ],
                                [
                                    0.22,
                                    0.24
                                ],
                                [
                                    0.58,
                                    0.57
                                ],
                                [
                                    1,
                                    0.95
                                ]
                            ]
                        },
                        "contrast": {
                            "amount": -0.2
                        },
                        "tint": {
                            "hue": 240,
                            "amount": 0.018
                        },
                        "roll": {
                            "amount": 0.35,
                            "knee": 0.68,
                            "chroma": -0.05
                        }
                    },
                    "append": [
                        {
                            "op": "colour.curve",
                            "params": {
                                "b": [
                                    [
                                        0,
                                        0.025
                                    ],
                                    [
                                        0.56,
                                        0.58
                                    ],
                                    [
                                        1,
                                        0.985
                                    ]
                                ]
                            }
                        },
                        {
                            "op": "colour.whiteBalance",
                            "params": {
                                "temperature": -0.16,
                                "tint": 0.05
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "M02",
            "name": "Saint-Malo",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 34,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Elegant, flattering"
            },
            "description": "Soft black and white with a gentle glow",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness",
                "neutralMono": true
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.3,
                                0.6,
                                0.1
                            ],
                            [
                                0.3,
                                0.6,
                                0.1
                            ],
                            [
                                0.3,
                                0.6,
                                0.1
                            ]
                        ]
                    },
                    "scale": "step",
                    "id": "mono"
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.23
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.46,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0
                    }
                }
            ],
            "presets": [
                {
                    "name": "White border",
                    "append": [
                        {
                            "op": "light.border",
                            "params": {
                                "amount": 0.7,
                                "width": 0.065,
                                "tone": 1.0
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C04",
            "name": "Albi",
            "version": 3,
            "class": 1,
            "tab": "Classic",
            "status": "Build",
            "round": "FX1",
            "rank": 52,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Editorial at low strength; red cast only if she picks Strong"
            },
            "description": "Red accents kept, other colours quieter; matte and brighter; darker corners",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": 0.181
                            },
                            "orange": {
                                "chroma": -0.542
                            },
                            "yellow": {
                                "chroma": -0.815
                            },
                            "green": {
                                "chroma": -0.995
                            },
                            "aqua": {
                                "chroma": -0.995
                            },
                            "blue": {
                                "chroma": -0.995
                            },
                            "purple": {
                                "chroma": -0.905
                            },
                            "magenta": {
                                "chroma": -0.542
                            }
                        }
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.217
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.679,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.566
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.652,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [
                {
                    "name": "Strong",
                    "append": [
                        {
                            "op": "colour.tint",
                            "params": {
                                "hue": 25,
                                "amount": 0.03
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C10",
            "name": "Grasse",
            "version": 3,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 53,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Playful rosy mood"
            },
            "description": "Rosy pastel, with a brighter exposure; softer contrast",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 355,
                        "highlightAmount": 0.078,
                        "balance": -0.45
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.207
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.207
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.24
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.3
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.375
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C11",
            "name": "Ramatuelle",
            "version": 2,
            "class": 1,
            "tab": "Vintage",
            "status": "Build",
            "round": "FX1",
            "rank": 54,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Pretty vintage feel"
            },
            "description": "Rosy, faded vintage, with muted colour",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.23
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 5,
                        "amount": 0.057
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.69,
                        "toneHue": 60,
                        "toneAmount": 0.057
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.35
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C12",
            "name": "Annecy",
            "version": 2,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 55,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Suits bright backgrounds"
            },
            "description": "Bright mint-aqua daylight",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.102
                            ],
                            [
                                0.5,
                                0.539
                            ],
                            [
                                0.8,
                                0.8
                            ],
                            [
                                1,
                                0.898
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.153
                            ],
                            [
                                0.5,
                                0.577
                            ],
                            [
                                0.8,
                                0.914
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.141
                            ],
                            [
                                0.5,
                                0.565
                            ],
                            [
                                0.8,
                                0.902
                            ],
                            [
                                1,
                                0.986
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.065
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C13",
            "name": "Chamonix",
            "version": 3,
            "class": 1,
            "tab": "Cool",
            "status": "Build",
            "round": "FX1",
            "rank": 56,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Cool tones flatter fewer complexions"
            },
            "description": "Cool, icy light; softer contrast",
            "editorial": {
                "family": "Editorial Day",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -1
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": -1,
                        "highlights": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.375
                    }
                }
            ],
            "presets": [
                {
                    "name": "Centre light",
                    "append": [
                        {
                            "op": "light.centre",
                            "params": {
                                "amount": 0.35,
                                "warmth": 0.0,
                                "radius": 0.45,
                                "follow": 0
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C15",
            "name": "Nice",
            "version": 3,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 57,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Sunny; saturation kept in check by the guard"
            },
            "description": "Golden sun, skin kept natural; matte, cross-processed colour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": true,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    },
                    {
                        "id": "structure",
                        "amount": 25
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.1575
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.189
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 80,
                        "highlightAmount": 0.0221,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.189,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "b": [
                            [
                                0,
                                0.0504
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.874
                            ]
                        ],
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.3,
                                0.258
                            ],
                            [
                                0.7,
                                0.763
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C20",
            "name": "Rouen",
            "version": 2,
            "class": 1,
            "tab": "Vintage",
            "status": "Build",
            "round": "FX1",
            "rank": 58,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Gentle nostalgia"
            },
            "description": "Low-key walnut brown with deep shadows",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.27
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.187
                            ],
                            [
                                0.5,
                                0.473
                            ],
                            [
                                0.75,
                                0.759
                            ],
                            [
                                1,
                                0.955
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.16
                            ],
                            [
                                0.5,
                                0.428
                            ],
                            [
                                0.75,
                                0.705
                            ],
                            [
                                1,
                                0.91
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.133
                            ],
                            [
                                0.5,
                                0.374
                            ],
                            [
                                0.75,
                                0.633
                            ],
                            [
                                1,
                                0.838
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.27
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.45,
                        "inner": 0.3,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C24",
            "name": "Montmartre",
            "version": 2,
            "class": 1,
            "tab": "Classic",
            "status": "Build",
            "round": "FX1",
            "rank": 59,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Urban character"
            },
            "description": "Moody city warmth, with a deeper exposure",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    },
                    {
                        "id": "structure",
                        "amount": 25
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.1785
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 85,
                        "amount": 0.0263
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.0893
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.315
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C27",
            "name": "Dordogne",
            "version": 3,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 60,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Good for outdoor portraits"
            },
            "description": "Green and yellow pastel, with more contrast; warmer and deeper",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "green": {
                                "chroma": 1.0,
                                "light": 0.7605
                            },
                            "yellow": {
                                "chroma": 1.0,
                                "light": 0.507
                            }
                        }
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.507
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.585
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.45
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.45
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C31",
            "name": "Sarlat",
            "version": 2,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 61,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Warm finish; smoothing only if she asks"
            },
            "description": "Bronzed summer warmth, with more contrast and muted colour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 62,
                        "amount": 0.041
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.2048
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.273
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.1365
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.3675
                    }
                }
            ],
            "presets": [
                {
                    "name": "Smooth",
                    "pending": [
                        "smoothing R18"
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C32",
            "name": "Semur",
            "version": 2,
            "class": 1,
            "tab": "Vintage",
            "status": "Build",
            "round": "FX1",
            "rank": 62,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Rich, cosy"
            },
            "description": "Warm vintage depth, with more contrast, deeper",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.3024
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.2016
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.3024
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.504,
                        "toneHue": 65,
                        "toneAmount": 0.0305
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.3024,
                        "threshold": 0.7,
                        "radius": 0.025,
                        "warmth": 1
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.378
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.315
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C33",
            "name": "Royan",
            "version": 3,
            "class": 1,
            "tab": "Warm",
            "status": "Build",
            "round": "FX1",
            "rank": 63,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Striking outdoors"
            },
            "description": "Coral-pink sunset warmth with a soft glow; brighter",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.031
                            ],
                            [
                                0.5,
                                0.52
                            ],
                            [
                                0.8,
                                0.846
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.012
                            ],
                            [
                                0.5,
                                0.488
                            ],
                            [
                                0.8,
                                0.763
                            ],
                            [
                                1,
                                0.926
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.032
                            ],
                            [
                                0.5,
                                0.477
                            ],
                            [
                                0.8,
                                0.782
                            ],
                            [
                                1,
                                0.936
                            ]
                        ]
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.218,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0.3
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.414,
                        "inner": 0.55,
                        "outer": 1
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.25
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C35",
            "name": "Valensole",
            "version": 3,
            "class": 1,
            "tab": "Pastel",
            "status": "Build",
            "round": "FX1",
            "rank": 64,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Soft and personal"
            },
            "description": "Soft haze: a gentle glow and faded tones; cross-processed colour",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.42,
                        "threshold": 0.55,
                        "radius": 0.06,
                        "warmth": 0.0
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.5775,
                        "toneAmount": 0,
                        "toneHue": 0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.42
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.1575
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.2457
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "b": [
                            [
                                0,
                                0.0651
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.8362
                            ]
                        ],
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.3,
                                0.2454
                            ],
                            [
                                0.7,
                                0.7819
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C36",
            "name": "Gordes",
            "version": 2,
            "class": 1,
            "tab": "Fade",
            "status": "Build",
            "round": "FX1",
            "rank": 65,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Dreamlike portrait mood"
            },
            "description": "Dreamy, low colour, with a brighter exposure and a cross-processed colour shift",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.36
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.42,
                        "toneHue": 0,
                        "toneAmount": 0
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.24,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0.0
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.3
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "b": [
                            [
                                0,
                                0.0576
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.856
                            ]
                        ],
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.3,
                                0.252
                            ],
                            [
                                0.7,
                                0.772
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C37",
            "name": "Calanques",
            "version": 3,
            "class": 1,
            "tab": "Cinematic",
            "status": "Build",
            "round": "FX1",
            "rank": 66,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Cinematic and shareable"
            },
            "description": "Teal shadows and background, warm skin tones; darker corners",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.2,
                                0.1559
                            ],
                            [
                                0.45,
                                0.4668
                            ],
                            [
                                0.75,
                                0.7332
                            ],
                            [
                                1,
                                0.9297
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.0441
                            ],
                            [
                                0.2,
                                0.2168
                            ],
                            [
                                0.45,
                                0.45
                            ],
                            [
                                0.75,
                                0.7762
                            ],
                            [
                                1,
                                0.9832
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.0882
                            ],
                            [
                                0.2,
                                0.2441
                            ],
                            [
                                0.45,
                                0.4059
                            ],
                            [
                                0.75,
                                0.7941
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.2636,
                        "inner": 0.35,
                        "outer": 1
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.4725,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C42",
            "name": "Joinville",
            "version": 2,
            "class": 1,
            "tab": "Cinematic",
            "status": "Build",
            "round": "FX1",
            "rank": 67,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Clean profile-photo finish"
            },
            "description": "Warm cinema grade, with more contrast",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 215,
                        "shadowAmount": 0.063,
                        "highlightHue": 60,
                        "highlightAmount": 0.063,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.252
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.127
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.1638
                    }
                }
            ],
            "presets": [
                {
                    "name": "Letterbox",
                    "pending": [
                        "letterbox FX2"
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C43",
            "name": "Lille",
            "version": 3,
            "class": 1,
            "tab": "Film-style",
            "status": "Build",
            "round": "FX1",
            "rank": 68,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Keepsake feel"
            },
            "description": "Instant-print feel, with richer colour",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.507
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.845
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.65,
                        "toneHue": 200,
                        "toneAmount": 0.051
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.455
                    }
                }
            ],
            "presets": [
                {
                    "name": "Print border",
                    "append": [
                        {
                            "op": "light.border",
                            "params": {
                                "amount": 0.7,
                                "width": 0.09,
                                "tone": 1.0
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "M01",
            "name": "Ouessant",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 69,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Timeless, no shape change"
            },
            "description": "Graphic black and white, strong contrast",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness",
                "neutralMono": true
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ],
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ],
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ]
                        ]
                    },
                    "scale": "step",
                    "id": "mono"
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.158
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.75,
                                0.865
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.158
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.75,
                                0.865
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.158
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.75,
                                0.865
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "M03",
            "name": "Tombelaine",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 70,
            "like": {
                "score": 4,
                "source": "assumed",
                "reason": "Soft editorial"
            },
            "description": "Matte silver black and white, lifted blacks",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness",
                "neutralMono": true
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.3,
                                0.6,
                                0.1
                            ],
                            [
                                0.3,
                                0.6,
                                0.1
                            ],
                            [
                                0.3,
                                0.6,
                                0.1
                            ]
                        ]
                    },
                    "scale": "step",
                    "id": "mono"
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.224
                            ],
                            [
                                0.3,
                                0.348
                            ],
                            [
                                0.5,
                                0.548
                            ],
                            [
                                0.7,
                                0.748
                            ],
                            [
                                1,
                                0.888
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.224
                            ],
                            [
                                0.3,
                                0.348
                            ],
                            [
                                0.5,
                                0.548
                            ],
                            [
                                0.7,
                                0.748
                            ],
                            [
                                1,
                                0.888
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.224
                            ],
                            [
                                0.3,
                                0.348
                            ],
                            [
                                0.5,
                                0.548
                            ],
                            [
                                0.7,
                                0.748
                            ],
                            [
                                1,
                                0.888
                            ]
                        ]
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C17",
            "name": "Céret",
            "version": 2,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 71,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Red-heavy contrast can take over skin"
            },
            "description": "Warm copper contrast with a dark edge",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.196
                            ],
                            [
                                0.5,
                                0.581
                            ],
                            [
                                0.75,
                                0.8835
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.1435
                            ],
                            [
                                0.5,
                                0.473
                            ],
                            [
                                0.75,
                                0.7905
                            ],
                            [
                                1,
                                0.9595
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.0745
                            ],
                            [
                                0.5,
                                0.3665
                            ],
                            [
                                0.75,
                                0.6435
                            ],
                            [
                                1,
                                0.8125
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.45
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.9,
                        "inner": 0.45,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C18",
            "name": "Saintes",
            "version": 2,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 72,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Dramatic, often too much on faces"
            },
            "description": "Deep contrast and saturation, with muted colour",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.6153
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.4778
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.2058
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.2646
                    }
                }
            ],
            "presets": [
                {
                    "name": "Strong",
                    "append": [
                        {
                            "op": "colour.tone",
                            "params": {
                                "shadows": -0.6,
                                "highlights": 0.0
                            }
                        }
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C19",
            "name": "Marseille",
            "version": 3,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 73,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Artistic, not everyday"
            },
            "description": "Cross-processed: yellow-green lights, blue blacks; darker corners",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0.0126
                            ],
                            [
                                0.25,
                                0.1996
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                0.75,
                                0.8078
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.25,
                                0.2248
                            ],
                            [
                                0.5,
                                0.5315
                            ],
                            [
                                0.75,
                                0.8256
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.021
                            ],
                            [
                                0.25,
                                0.2626
                            ],
                            [
                                0.5,
                                0.4937
                            ],
                            [
                                0.75,
                                0.6922
                            ],
                            [
                                1,
                                0.873
                            ]
                        ]
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.4725,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C22",
            "name": "Nancy",
            "version": 2,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 74,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Editorial, can flatten skin"
            },
            "description": "Metallic grey-green, with more contrast",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.217
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.072
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.326
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 150,
                        "amount": 0.014
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.255
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C23",
            "name": "Toulouse",
            "version": 2,
            "class": 1,
            "tab": "Cinematic",
            "status": "Build",
            "round": "FX1",
            "rank": 75,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Dark style hides detail"
            },
            "description": "Purple-brown drama, with a deeper exposure",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    },
                    {
                        "id": "structure",
                        "amount": 25
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 310,
                        "shadowAmount": 0.0609,
                        "highlightHue": 60,
                        "highlightAmount": 0.0305,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.379
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.5313
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.2278
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C25",
            "name": "Belleville",
            "version": 3,
            "class": 1,
            "tab": "Cinematic",
            "status": "Build",
            "round": "FX1",
            "rank": 76,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Can show noise"
            },
            "description": "Night mood, with more contrast",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.3528
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.2016
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.6048,
                        "knee": 0.65
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.189
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.315
                    }
                }
            ],
            "presets": [
                {
                    "name": "Sharp",
                    "pending": [
                        "sharpen FX2"
                    ]
                }
            ],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C34",
            "name": "Belle-Île",
            "version": 2,
            "class": 1,
            "tab": "Cool",
            "status": "Build",
            "round": "FX1",
            "rank": 77,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Niche mood"
            },
            "description": "Dark steel-blue night with a heavy edge",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.369
                    }
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.5,
                                0.467
                            ],
                            [
                                1,
                                0.918
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0.016
                            ],
                            [
                                0.5,
                                0.492
                            ],
                            [
                                1,
                                0.967
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.066
                            ],
                            [
                                0.25,
                                0.266
                            ],
                            [
                                0.5,
                                0.516
                            ],
                            [
                                1,
                                1
                            ]
                        ]
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.082
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.451,
                        "inner": 0.28,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "M04",
            "name": "Le Havre",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 78,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Hides detail on darker skin; guard limits crush"
            },
            "description": "Low-key noir black and white, dark edges",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness",
                "neutralMono": true
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.5,
                                0.4,
                                0.1
                            ],
                            [
                                0.5,
                                0.4,
                                0.1
                            ],
                            [
                                0.5,
                                0.4,
                                0.1
                            ]
                        ]
                    },
                    "scale": "step",
                    "id": "mono"
                },
                {
                    "op": "colour.curve",
                    "params": {
                        "r": [
                            [
                                0,
                                0
                            ],
                            [
                                0.15,
                                0.1
                            ],
                            [
                                0.5,
                                0.4
                            ],
                            [
                                0.85,
                                0.84
                            ],
                            [
                                1,
                                0.97
                            ]
                        ],
                        "g": [
                            [
                                0,
                                0
                            ],
                            [
                                0.15,
                                0.1
                            ],
                            [
                                0.5,
                                0.4
                            ],
                            [
                                0.85,
                                0.84
                            ],
                            [
                                1,
                                0.97
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0
                            ],
                            [
                                0.15,
                                0.1
                            ],
                            [
                                0.5,
                                0.4
                            ],
                            [
                                0.85,
                                0.84
                            ],
                            [
                                1,
                                0.97
                            ]
                        ]
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.85,
                        "inner": 0.2,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; lane 11 curated set (16 looks, measured on four synthetic skin tones)",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "M05",
            "name": "Roubaix",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 79,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Expressive rather than flattering"
            },
            "description": "Gritty mono",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    },
                    {
                        "id": "structure",
                        "amount": 25
                    },
                    {
                        "id": "grain",
                        "amount": 45
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness",
                "neutralMono": true
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.45,
                                0.45,
                                0.1
                            ],
                            [
                                0.45,
                                0.45,
                                0.1
                            ],
                            [
                                0.45,
                                0.45,
                                0.1
                            ]
                        ]
                    },
                    "scale": "step",
                    "id": "mono"
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.3
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "M06",
            "name": "Montparnasse",
            "version": 2,
            "class": 1,
            "tab": "Monochrome",
            "status": "Build",
            "round": "FX1",
            "rank": 80,
            "like": {
                "score": 3,
                "source": "assumed",
                "reason": "Selected portraits only"
            },
            "description": "Dark vintage mono",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "lightness"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.channelMixer",
                    "params": {
                        "matrix": [
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ],
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ],
                            [
                                0.2126,
                                0.7152,
                                0.0722
                            ]
                        ]
                    },
                    "scale": "linear",
                    "id": "mono"
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.35
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 70,
                        "amount": 0.035
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.28
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C21",
            "name": "Lagrasse",
            "version": 2,
            "class": 1,
            "tab": "Vintage",
            "status": "Build",
            "round": "FX1",
            "rank": 81,
            "like": {
                "score": 2,
                "source": "assumed",
                "reason": "Heavy edges rarely flatter a face"
            },
            "description": "Burnt glowing centre, heavy edges",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.336,
                        "toneHue": 60,
                        "toneAmount": 0.0336
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.336
                    }
                },
                {
                    "op": "light.centre",
                    "params": {
                        "amount": 0.504,
                        "warmth": 1,
                        "radius": 0.5,
                        "follow": 0
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 1,
                        "inner": 0.2,
                        "outer": 1
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        },
        {
            "id": "C29",
            "name": "Dunkerque",
            "version": 3,
            "class": 1,
            "tab": "Contrast",
            "status": "Build",
            "round": "FX1",
            "rank": 82,
            "like": {
                "score": 2,
                "source": "assumed",
                "reason": "Unforgiving shadows on faces"
            },
            "description": "Dark, hard contrast, with darker corners; richer colour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 65,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": false,
                "addons": [
                    {
                        "id": "fade",
                        "amount": 0
                    }
                ]
            },
            "limits": {
                "strengthMax": 100,
                "geometry": "none",
                "simulationLabel": false,
                "funTab": false,
                "guardMode": "full"
            },
            "needs": {
                "landmarks": false,
                "masks": [
                    "face-skin",
                    "body-skin"
                ],
                "depth": false,
                "camera": false,
                "clip": false
            },
            "stages": [
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.3794
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.1715
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.4819,
                        "knee": 0.6
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.104
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.3645,
                        "inner": 0.35,
                        "outer": 0.95
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.4725
                    }
                }
            ],
            "presets": [],
            "seed": "photo",
            "safety": {
                "eyesClear": false,
                "faceClear": false
            },
            "provenance": {
                "writtenFrom": "filters-plan.md §3.1; reworked Oct 31, 2026 so all 61 looks are distinct and keep skin natural, measured on four synthetic skin tones",
                "answers": [
                    "#8"
                ],
                "concepts": [
                    "OKLab"
                ],
                "rankProvisional": true
            }
        }
    ],
    "addons": [
        {
            "id": "border",
            "label": "Border",
            "built": true,
            "round": "FX2",
            "stage": {
                "op": "light.border",
                "params": {
                    "amount": 0.7,
                    "width": 0.07,
                    "tone": -1.0
                }
            }
        },
        {
            "id": "centre-light",
            "label": "Centre light",
            "built": true,
            "round": "FX2",
            "stage": {
                "op": "light.centre",
                "params": {
                    "amount": 0.55,
                    "warmth": 0.1,
                    "radius": 0.5,
                    "cx": 0.5,
                    "cy": 0.45,
                    "follow": 1.0
                }
            }
        },
        {
            "id": "fade",
            "label": "Fade",
            "built": true,
            "round": "FX1",
            "stage": {
                "op": "colour.fade",
                "params": {
                    "amount": 0.6
                }
            }
        },
        {
            "id": "glow",
            "label": "Glow",
            "built": true,
            "round": "FX2",
            "stage": {
                "op": "spatial.glow",
                "params": {
                    "amount": 0.48,
                    "threshold": 0.78,
                    "radius": 0.02,
                    "warmth": 0.0
                }
            }
        },
        {
            "id": "grain",
            "label": "Grain",
            "built": true,
            "round": "FX2",
            "manualOnly": true,
            "stage": {
                "op": "spatial.grain",
                "params": {
                    "amount": 0.85,
                    "seed": 104729
                }
            }
        },
        {
            "id": "halation",
            "label": "Halation",
            "built": true,
            "round": "FX2",
            "stage": {
                "op": "spatial.halation",
                "params": {
                    "amount": 0.7,
                    "threshold": 0.72,
                    "radius": 0.025,
                    "warmth": 0.85
                }
            }
        },
        {
            "id": "structure",
            "label": "Structure",
            "built": true,
            "round": "FX2",
            "manualOnly": true,
            "stage": {
                "op": "spatial.structure",
                "params": {
                    "amount": 0.8,
                    "radius": 0.012,
                    "threshold": 0.015
                }
            }
        },
        {
            "id": "vignette",
            "label": "Vignette",
            "built": true,
            "round": "FX2",
            "stage": {
                "op": "light.vignette",
                "params": {
                    "amount": 0.7,
                    "inner": 0.35,
                    "outer": 1.0
                }
            }
        }
    ],
    "ranking": [
        {
            "rank": 1,
            "id": "C01",
            "name": "Deauville",
            "like": 5,
            "source": "report#9",
            "round": "FX1"
        },
        {
            "rank": 2,
            "id": "BE6",
            "name": "Brantôme",
            "like": 5,
            "source": "report#72",
            "round": "FX4"
        },
        {
            "rank": 3,
            "id": "O01",
            "name": "Gerberoy",
            "like": 5,
            "source": "report#17",
            "round": "FX4"
        },
        {
            "rank": 4,
            "id": "O02",
            "name": "Sault",
            "like": 5,
            "source": "report#17",
            "round": "FX4"
        },
        {
            "rank": 5,
            "id": "O04",
            "name": "Eygalières",
            "like": 5,
            "source": "report#20",
            "round": "FX4"
        },
        {
            "rank": 6,
            "id": "C02",
            "name": "Biarritz",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 7,
            "id": "C03",
            "name": "Giverny",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 8,
            "id": "C05",
            "name": "Menton",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 9,
            "id": "C06",
            "name": "Honfleur",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 10,
            "id": "C07",
            "name": "Étretat",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 11,
            "id": "C08",
            "name": "Èze",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 12,
            "id": "C09",
            "name": "Provence",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 13,
            "id": "C102",
            "name": "Sceaux",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 14,
            "id": "C103",
            "name": "Senlis",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 15,
            "id": "C105",
            "name": "Chatou",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 16,
            "id": "C106",
            "name": "Bougival",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 17,
            "id": "C107",
            "name": "Croissy",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 18,
            "id": "C14",
            "name": "Lyon",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 19,
            "id": "C16",
            "name": "Antibes",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 20,
            "id": "C26",
            "name": "Colmar",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 21,
            "id": "C28",
            "name": "Fontainebleau",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 22,
            "id": "C30",
            "name": "Périgord",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 23,
            "id": "C38",
            "name": "Camargue",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 24,
            "id": "C39",
            "name": "Talloires",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 25,
            "id": "C40",
            "name": "Uzès",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 26,
            "id": "C41",
            "name": "Conques",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 27,
            "id": "C50",
            "name": "Arcachon",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 28,
            "id": "C53",
            "name": "Granville",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 29,
            "id": "C54",
            "name": "Dinard",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 30,
            "id": "C55",
            "name": "Bréhat",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 31,
            "id": "C63",
            "name": "Chenonceau",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 32,
            "id": "C77",
            "name": "Villefranche",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 33,
            "id": "C93",
            "name": "Palavas",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 34,
            "id": "M02",
            "name": "Saint-Malo",
            "like": 5,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 35,
            "id": "B06",
            "name": "Saint-Lunaire",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 36,
            "id": "F07",
            "name": "Biot",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 37,
            "id": "L02",
            "name": "Trocadéro",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 38,
            "id": "L03",
            "name": "Giens",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 39,
            "id": "L04",
            "name": "Hyères",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 40,
            "id": "L05",
            "name": "Porquerolles",
            "like": 5,
            "source": "assumed",
            "round": "FX2"
        },
        {
            "rank": 41,
            "id": "A10",
            "name": "Rustrel",
            "like": 5,
            "source": "assumed",
            "round": "FX3"
        },
        {
            "rank": 42,
            "id": "B03",
            "name": "Vaux",
            "like": 5,
            "source": "assumed",
            "round": "FX3"
        },
        {
            "rank": 43,
            "id": "CO6",
            "name": "Neuilly",
            "like": 5,
            "source": "assumed",
            "round": "FX3"
        },
        {
            "rank": 44,
            "id": "BE1",
            "name": "Évaux",
            "like": 5,
            "source": "assumed",
            "round": "FX4"
        },
        {
            "rank": 45,
            "id": "BE5",
            "name": "Bad Day Rescue",
            "like": 5,
            "source": "assumed",
            "round": "FX4"
        },
        {
            "rank": 46,
            "id": "K04",
            "name": "Cordouan",
            "like": 5,
            "source": "assumed",
            "round": "FX6"
        },
        {
            "rank": 47,
            "id": "K05",
            "name": "Ciboure",
            "like": 5,
            "source": "assumed",
            "round": "FX6"
        },
        {
            "rank": 48,
            "id": "PA2",
            "name": "Bagatelle",
            "like": 5,
            "source": "assumed",
            "round": "FX7"
        },
        {
            "rank": 49,
            "id": "BE3",
            "name": "Aix",
            "like": 4,
            "source": "report#71",
            "round": "FX4"
        },
        {
            "rank": 50,
            "id": "O06",
            "name": "Chaville",
            "like": 4,
            "source": "report#28",
            "round": "FX4"
        },
        {
            "rank": 51,
            "id": "O07",
            "name": "Montargis",
            "like": 4,
            "source": "report#16",
            "round": "FX4"
        },
        {
            "rank": 52,
            "id": "C04",
            "name": "Albi",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 53,
            "id": "C10",
            "name": "Grasse",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 54,
            "id": "C11",
            "name": "Ramatuelle",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 55,
            "id": "C12",
            "name": "Annecy",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 56,
            "id": "C13",
            "name": "Chamonix",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 57,
            "id": "C15",
            "name": "Nice",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 58,
            "id": "C20",
            "name": "Rouen",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 59,
            "id": "C24",
            "name": "Montmartre",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 60,
            "id": "C27",
            "name": "Dordogne",
            "like": 4,
            "source": "assumed",
            "round": "FX1"
        },
        {
            "rank": 61,
            "id": "C31",
            "name": "Sarlat",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 62,
            "id": "C32",
            "name": "Semur",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 63,
            "id": "C33",
            "name": "Royan",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 64,
            "id": "C35",
            "name": "Valensole",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 65,
            "id": "C36",
            "name": "Gordes",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 66,
            "id": "C37",
            "name": "Calanques",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 67,
            "id": "C42",
            "name": "Joinville",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 68,
            "id": "C43",
            "name": "Lille",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 69,
            "id": "M01",
            "name": "Ouessant",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 70,
            "id": "M03",
            "name": "Tombelaine",
            "like": 4,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 71,
            "id": "C17",
            "name": "Céret",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 72,
            "id": "C18",
            "name": "Saintes",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 73,
            "id": "C19",
            "name": "Marseille",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 74,
            "id": "C22",
            "name": "Nancy",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 75,
            "id": "C23",
            "name": "Toulouse",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 76,
            "id": "C25",
            "name": "Belleville",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 77,
            "id": "C34",
            "name": "Belle-Île",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 78,
            "id": "M04",
            "name": "Le Havre",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 79,
            "id": "M05",
            "name": "Roubaix",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 80,
            "id": "M06",
            "name": "Montparnasse",
            "like": 3,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 81,
            "id": "C21",
            "name": "Lagrasse",
            "like": 2,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        },
        {
            "rank": 82,
            "id": "C29",
            "name": "Dunkerque",
            "like": 2,
            "source": "assumed",
            "round": "FX1",
            "provisional": true
        }
    ]
};
//# sourceMappingURL=recipes.js.map