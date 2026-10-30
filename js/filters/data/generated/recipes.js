export const CATALOGUE = {
    "format": "beljour-filter/1",
    "recipes": [
        {
            "id": "C01",
            "name": "Deauville",
            "version": 1,
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
            "description": "Crisp contrast, cool shadows, warm highlights",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.45
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.35
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 225,
                        "shadowAmount": 0.035,
                        "highlightHue": 70,
                        "highlightAmount": 0.03,
                        "balance": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Rich warm colour with a soft highlight glow",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                                "chroma": 0.25,
                                "light": 0.2
                            },
                            "orange": {
                                "chroma": 0.25,
                                "light": 0.25
                            },
                            "yellow": {
                                "chroma": 0.3,
                                "light": 0.2
                            },
                            "green": {
                                "hue": 8,
                                "chroma": -0.1
                            },
                            "aqua": {
                                "hue": 6
                            },
                            "blue": {
                                "hue": 6,
                                "chroma": 0.1
                            }
                        }
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.12,
                        "threshold": 0.75,
                        "radius": 0.02,
                        "warmth": 0.3
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Airy and bright; blues and greens lifted",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.12
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": -0.25
                            },
                            "green": {
                                "chroma": 0.3
                            },
                            "aqua": {
                                "chroma": 0.3
                            },
                            "blue": {
                                "chroma": 0.3
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Sunny, slightly faded warmth",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.15
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 90,
                        "amount": 0.03
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.15
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.45,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Washed-out nostalgic softness",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 1.0,
                        "knee": 0.6
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.33
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.15,
                        "toneHue": 95,
                        "toneAmount": 0.03
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.15
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Creamy pastel haze",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "hue": 88,
                        "amount": 0.035
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.25
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.1,
                        "toneHue": 0.0,
                        "toneAmount": 0.0
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.25,
                        "threshold": 0.65,
                        "radius": 0.03,
                        "warmth": 0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Near-invisible polish",
            "editorial": {
                "family": "Masthead",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.15
                    }
                },
                {
                    "id": "contrast",
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.08
                    }
                },
                {
                    "id": "sat",
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.06
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Soft pastel light",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": -0.5
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "red": {
                                "chroma": -0.1
                            },
                            "orange": {
                                "chroma": -0.15
                            },
                            "yellow": {
                                "chroma": -0.2,
                                "hue": 6
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.12
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.5,
                        "knee": 0.7
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 13,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Ivory light"
            },
            "description": "Ivory highlights, soft contrast",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "highlightAmount": 0.04,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.18
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.3,
                        "knee": 0.7
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C103",
            "name": "Senlis",
            "version": 1,
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
            "description": "Clean whites, her skin tone neutral",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.25,
                        "knee": 0.7,
                        "chroma": -0.6
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.0,
                        "highlights": 0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C105",
            "name": "Chatou",
            "version": 1,
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
            "description": "Gentle diffusion, neutral colour",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.35,
                        "threshold": 0.5,
                        "radius": 0.04,
                        "warmth": 0.0
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.05
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.15,
                        "toneHue": 0.0,
                        "toneAmount": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
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
            "version": 1,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 16,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Pearl"
            },
            "description": "Pearly highlight glow, very subtle",
            "editorial": {
                "family": "Salon Suite",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.2,
                        "threshold": 0.78,
                        "radius": 0.02,
                        "warmth": -0.1
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 320,
                        "highlightAmount": 0.012,
                        "balance": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
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
            "version": 1,
            "class": 1,
            "tab": "Clean",
            "status": "Build",
            "round": "FX1",
            "rank": 17,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Warm light"
            },
            "description": "Warm white balance, soft",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "temperature": 0.45
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.1
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.2,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C14",
            "name": "Lyon",
            "version": 1,
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
            "description": "Gentle warmth",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "temperature": 0.25
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.12
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.3,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Blue water, warm light",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                                "chroma": 0.35,
                                "light": -0.15
                            },
                            "aqua": {
                                "chroma": 0.25,
                                "light": -0.1
                            }
                        }
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 58,
                        "highlightAmount": 0.035,
                        "balance": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
                "strength": 30,
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
                        "amount": 0.8
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.05
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Warm background, face untouched",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
                "guard": true,
                "protectSkin": false,
                "backgroundOnly": true,
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
                    "body-skin",
                    "person"
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
                                "chroma": 0.25
                            },
                            "orange": {
                                "chroma": 0.35
                            },
                            "yellow": {
                                "chroma": 0.35
                            }
                        }
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.25
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Golden hour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                    "id": "wb",
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.45
                    }
                },
                {
                    "id": "contrast",
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2
                    }
                },
                {
                    "id": "split",
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 240,
                        "shadowAmount": 0.02,
                        "highlightHue": 75,
                        "highlightAmount": 0.02,
                        "balance": 0.0
                    }
                }
            ],
            "presets": [
                {
                    "name": "Golden Vinyl",
                    "patch": {
                        "wb": {
                            "temperature": 0.22,
                            "tint": 0.01
                        },
                        "contrast": {
                            "amount": 0.14
                        },
                        "split": {
                            "shadowHue": 246,
                            "shadowAmount": 0.01,
                            "highlightHue": 52,
                            "highlightAmount": 0.028,
                            "balance": 0.08
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Matte finish",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.45,
                        "toneHue": 0.0,
                        "toneAmount": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Soft-focus portrait, slightly cool, her skin kept as it is",
            "editorial": {
                "family": "Salon Suite",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "temperature": -0.3
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.3,
                        "threshold": 0.55,
                        "radius": 0.035,
                        "warmth": -0.4
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Romantic warm glow",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "temperature": 0.15
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.3,
                        "toneHue": 75,
                        "toneAmount": 0.02
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.25,
                        "threshold": 0.65,
                        "radius": 0.03,
                        "warmth": 0.6
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Light drawn to the face",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.35,
                        "warmth": 0.0,
                        "radius": 0.45,
                        "follow": 1
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.2,
                        "inner": 0.35,
                        "outer": 1.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Honey mids, gentle gold highlights, low contrast",
            "editorial": {
                "family": "Editorial Day",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.025
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 85,
                        "highlightAmount": 0.025,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.12
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C53",
            "name": "Granville",
            "version": 1,
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
            "description": "True colour: half the colour cast removed",
            "editorial": {
                "family": "Masthead",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.6
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.15
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
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
            "version": 1,
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
            "description": "A little brighter, livelier, cleaner greens",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.2
                    }
                },
                {
                    "op": "colour.vibrance",
                    "params": {
                        "amount": 0.25
                    }
                },
                {
                    "op": "colour.hsl",
                    "params": {
                        "bands": {
                            "green": {
                                "chroma": 0.3,
                                "hue": 8
                            }
                        }
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C55",
            "name": "Bréhat",
            "version": 1,
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
            "description": "Soft highlights, open shadows, neutral colour",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.7,
                        "knee": 0.65
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": 0.5,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C63",
            "name": "Chenonceau",
            "version": 1,
            "class": 1,
            "tab": "Classic",
            "status": "Build",
            "round": "FX1",
            "rank": 31,
            "like": {
                "score": 5,
                "source": "assumed",
                "reason": "Soft portrait classic"
            },
            "description": "Low contrast with a slight highlight glow",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": -0.2
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.15,
                        "threshold": 0.72,
                        "radius": 0.025,
                        "warmth": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
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
            "version": 1,
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
            "description": "Peach in the highlights",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "highlightAmount": 0.045,
                        "balance": -0.2
                    }
                },
                {
                    "id": "expo",
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.05
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "C93",
            "name": "Palavas",
            "version": 1,
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
            "description": "Portrait film: soft contrast, warm mids",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                                0.03
                            ],
                            [
                                0.5,
                                0.5
                            ],
                            [
                                1,
                                0.97
                            ]
                        ]
                    }
                },
                {
                    "id": "contrast",
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.15
                    }
                },
                {
                    "id": "tint",
                    "op": "colour.tint",
                    "params": {
                        "hue": 65,
                        "amount": 0.015
                    }
                },
                {
                    "id": "roll",
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.3,
                        "knee": 0.7
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
                "writtenFrom": "filters-plan.md §2.1 table 1H",
                "answers": [],
                "concepts": [
                    "OKLab"
                ]
            }
        },
        {
            "id": "M02",
            "name": "Saint-Malo",
            "version": 1,
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
            "description": "Soft mono with a faint violet tone",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": -0.1
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 300,
                        "amount": 0.015
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.2,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
            "description": "Red accents kept, other colours quieter",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                                "chroma": 0.1
                            },
                            "orange": {
                                "chroma": -0.3
                            },
                            "yellow": {
                                "chroma": -0.45
                            },
                            "green": {
                                "chroma": -0.55
                            },
                            "aqua": {
                                "chroma": -0.55
                            },
                            "blue": {
                                "chroma": -0.55
                            },
                            "purple": {
                                "chroma": -0.5
                            },
                            "magenta": {
                                "chroma": -0.3
                            }
                        }
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.12
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Rosy pastel",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "highlightAmount": 0.045,
                        "balance": -0.3
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.12
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.12
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Rosy, faded vintage",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.1
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 5,
                        "amount": 0.025
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.3,
                        "toneHue": 60,
                        "toneAmount": 0.025
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Fresh aqua pastel",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "hue": 195,
                        "amount": 0.03
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.14
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.12
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Cool, icy light",
            "editorial": {
                "family": "Editorial Day",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "temperature": -0.45
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": -0.5,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Golden, saturated sun",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.25
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.3
                    }
                },
                {
                    "op": "colour.splitTone",
                    "params": {
                        "shadowHue": 0,
                        "shadowAmount": 0,
                        "highlightHue": 80,
                        "highlightAmount": 0.035,
                        "balance": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Soft sepia warmth",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": -0.35
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
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.15,
                        "threshold": 0.7,
                        "radius": 0.025,
                        "warmth": 0.4
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.3,
                        "inner": 0.35,
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Moody city warmth",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": -0.2
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 85,
                        "amount": 0.03
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": -0.1
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Green and yellow pastel",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                                "chroma": 0.4,
                                "light": 0.15
                            },
                            "yellow": {
                                "chroma": 0.35,
                                "light": 0.1
                            }
                        }
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.1
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Bronzed summer warmth",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.03
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.15
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.2
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.1
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Warm vintage depth",
            "editorial": {
                "family": "Heritage",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.15
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.1
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.15
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.25,
                        "toneHue": 65,
                        "toneAmount": 0.015
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.15,
                        "threshold": 0.7,
                        "radius": 0.025,
                        "warmth": 0.5
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Sunset colour",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "shadowHue": 55,
                        "shadowAmount": 0.008,
                        "highlightHue": 55,
                        "highlightAmount": 0.045,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 335,
                        "amount": 0.02
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Lavender haze",
            "editorial": {
                "family": "Editorial Day",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "hue": 305,
                        "amount": 0.03
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.1
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.2,
                        "threshold": 0.65,
                        "radius": 0.03,
                        "warmth": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Dreamy, low colour",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": -0.4
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.35,
                        "toneHue": 0.0,
                        "toneAmount": 0.0
                    }
                },
                {
                    "op": "spatial.glow",
                    "params": {
                        "amount": 0.2,
                        "threshold": 0.7,
                        "radius": 0.03,
                        "warmth": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Two-tone sky-to-sand grade",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "shadowHue": 300,
                        "shadowAmount": 0.015,
                        "highlightHue": 55,
                        "highlightAmount": 0.015,
                        "balance": 0.0
                    }
                },
                {
                    "op": "light.grade",
                    "params": {
                        "topHue": 270,
                        "topAmount": 0.04,
                        "bottomHue": 65,
                        "bottomAmount": 0.04
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Warm cinema grade",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "shadowAmount": 0.03,
                        "highlightHue": 60,
                        "highlightAmount": 0.035,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.1
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Instant-print feel",
            "editorial": {
                "family": "Heritage",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": 0.15
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.25
                    }
                },
                {
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.35,
                        "toneHue": 200,
                        "toneAmount": 0.015
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Neutral black and white",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.25
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
            "description": "Faded mono",
            "editorial": {
                "family": "Heritage",
                "light": "Window"
            },
            "defaults": {
                "strength": 30,
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
                    "op": "colour.fade",
                    "params": {
                        "amount": 0.4,
                        "toneHue": 0.0,
                        "toneAmount": 0.0
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": -0.35,
                        "highlights": 0.0
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
            "description": "Hard contrast, warm red shift",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.6
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.2
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 30,
                        "amount": 0.025
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Deep contrast and saturation",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.45
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.35
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": 0.15
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Cross-processed punch",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.7
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": 0.3
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
                                0.2
                            ],
                            [
                                0.75,
                                0.82
                            ],
                            [
                                1,
                                1
                            ]
                        ],
                        "b": [
                            [
                                0,
                                0.06
                            ],
                            [
                                0.5,
                                0.48
                            ],
                            [
                                1,
                                0.92
                            ]
                        ]
                    }
                },
                {
                    "op": "light.centre",
                    "params": {
                        "amount": 0.2,
                        "warmth": 0.6,
                        "radius": 0.45,
                        "follow": 0
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.45,
                        "inner": 0.35,
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Metallic grey-green",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.3
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": 0.1
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.45
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 150,
                        "amount": 0.02
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Purple-brown drama",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "shadowAmount": 0.04,
                        "highlightHue": 60,
                        "highlightAmount": 0.02,
                        "balance": 0.0
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.25
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.35
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Night mood",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "ev": -0.35
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.2
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.6,
                        "knee": 0.65
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Blue-violet dusk",
            "editorial": {
                "family": "Cover Evening",
                "light": "Evening"
            },
            "defaults": {
                "strength": 30,
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
                        "hue": 285,
                        "amount": 0.04
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.25
                    }
                },
                {
                    "op": "colour.whiteBalance",
                    "params": {
                        "temperature": -0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Hard mono",
            "editorial": {
                "family": "Masthead",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                                0.25,
                                0.65,
                                0.1
                            ],
                            [
                                0.25,
                                0.65,
                                0.1
                            ],
                            [
                                0.25,
                                0.65,
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
                        "amount": 0.7
                    }
                },
                {
                    "op": "colour.tone",
                    "params": {
                        "shadows": -0.6,
                        "highlights": 0.4
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
                "strength": 30,
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
                        "amount": 0.6
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
                "strength": 30,
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
                        "ev": -0.25
                    }
                },
                {
                    "op": "colour.tint",
                    "params": {
                        "hue": 70,
                        "amount": 0.025
                    }
                },
                {
                    "op": "colour.contrast",
                    "params": {
                        "amount": 0.2
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
                "writtenFrom": "filters-plan.md §2.1 table 1B",
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
            "version": 1,
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
                "strength": 30,
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
                        "amount": 0.2,
                        "toneHue": 60,
                        "toneAmount": 0.02
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.2
                    }
                },
                {
                    "op": "light.centre",
                    "params": {
                        "amount": 0.3,
                        "warmth": 0.8,
                        "radius": 0.5,
                        "follow": 0
                    }
                },
                {
                    "op": "light.vignette",
                    "params": {
                        "amount": 0.75,
                        "inner": 0.2,
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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
            "version": 1,
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
            "description": "Dark, hard contrast",
            "editorial": {
                "family": "Cover Evening",
                "light": "Studio"
            },
            "defaults": {
                "strength": 30,
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
                        "amount": 0.55
                    }
                },
                {
                    "op": "colour.exposure",
                    "params": {
                        "ev": -0.25
                    }
                },
                {
                    "op": "colour.highlightRolloff",
                    "params": {
                        "amount": 0.7,
                        "knee": 0.6
                    }
                },
                {
                    "op": "colour.saturation",
                    "params": {
                        "amount": -0.15
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
                "writtenFrom": "filters-plan.md §2.1 table 1A",
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