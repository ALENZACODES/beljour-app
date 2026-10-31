export const PORTRAIT_LOOKS = {
    "format": "beljour-portrait-looks/1",
    "author": "John Khan",
    "about": "Named portrait looks: texture-preserving skin polish, gentle definition of eyes, brows and lips, and a colour grade on the filter engine, in one tap. Own names, own curve points and values; no other app's names, output, presets, LUTs or assets. Values are targets at strength 100. polish is the share of the skin's mid-scale tone variation smoothed (pores and marks are kept); emphasis is the local structure weight on eyes, brows and lips; sparkle is procedural. Every value here is ASSUMED until an arena run on real faces.",
    "looks": [
        {
            "polish": 0.45,
            "emphasis": {
                "eyes": 0.45,
                "brows": 0.35,
                "lips": 0.2
            },
            "sparkle": null,
            "recipe": {
                "id": "PL01",
                "name": "Lourmarin",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 1,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Soft warm matte: calm skin, quiet definition",
                "editorial": {
                    "family": "Editorial Day",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.curve",
                        "params": {
                            "master": [
                                [
                                    0,
                                    0
                                ],
                                [
                                    0.25,
                                    0.235
                                ],
                                [
                                    0.75,
                                    0.75
                                ],
                                [
                                    1,
                                    0.965
                                ]
                            ]
                        }
                    },
                    {
                        "op": "colour.whiteBalance",
                        "params": {
                            "temperature": 0.12
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": -0.08
                        }
                    },
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.35
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.4,
                "brows": 0.35,
                "lips": 0.25
            },
            "sparkle": null,
            "recipe": {
                "id": "PL02",
                "name": "Amboise",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 2,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Creamy classic portrait with warm shadows",
                "editorial": {
                    "family": "Heritage",
                    "light": "Studio"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 40,
                            "shadowAmount": 0.03,
                            "highlightHue": 75,
                            "highlightAmount": 0.025,
                            "balance": 0
                        }
                    },
                    {
                        "op": "colour.saturation",
                        "params": {
                            "amount": -0.1
                        }
                    },
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.4
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.5,
            "emphasis": {
                "eyes": 0.35,
                "brows": 0.25,
                "lips": 0.15
            },
            "sparkle": null,
            "recipe": {
                "id": "PL03",
                "name": "Cabourg",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 3,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Airy seaside pastel with fresh, even skin",
                "editorial": {
                    "family": "Editorial Day",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.curve",
                        "params": {
                            "master": [
                                [
                                    0,
                                    0
                                ],
                                [
                                    0.5,
                                    0.495
                                ],
                                [
                                    0.85,
                                    0.86
                                ],
                                [
                                    1,
                                    0.975
                                ]
                            ]
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": -0.15
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 220,
                            "shadowAmount": 0.025,
                            "highlightHue": 60,
                            "highlightAmount": 0.02,
                            "balance": 0
                        }
                    },
                    {
                        "op": "colour.hsl",
                        "params": {
                            "bands": {
                                "blue": {
                                    "chroma": -0.2
                                },
                                "aqua": {
                                    "light": 0.1
                                }
                            }
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.35,
            "emphasis": {
                "eyes": 0.75,
                "brows": 0.55,
                "lips": 0.3
            },
            "sparkle": null,
            "recipe": {
                "id": "PL04",
                "name": "Bonifacio",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 4,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Crisp limestone light and clearly defined eyes",
                "editorial": {
                    "family": "Masthead",
                    "light": "Studio"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.3,
                            "chroma": -0.15
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": 0.15
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 215,
                            "shadowAmount": 0.03,
                            "highlightHue": 70,
                            "highlightAmount": 0.02,
                            "balance": 0
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.6,
                "brows": 0.45,
                "lips": 0.25
            },
            "sparkle": null,
            "recipe": {
                "id": "PL05",
                "name": "Carnac",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 5,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Moody Atlantic grade with cool shadows",
                "editorial": {
                    "family": "Cover Evening",
                    "light": "Evening"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.3
                        }
                    },
                    {
                        "op": "colour.whiteBalance",
                        "params": {
                            "temperature": -0.1
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 230,
                            "shadowAmount": 0.045,
                            "highlightHue": 45,
                            "highlightAmount": 0.02,
                            "balance": 0
                        }
                    },
                    {
                        "op": "light.vignette",
                        "params": {
                            "amount": 0.35
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.35,
            "emphasis": {
                "eyes": 0.5,
                "brows": 0.4,
                "lips": 0.3
            },
            "sparkle": null,
            "recipe": {
                "id": "PL06",
                "name": "Sète",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 6,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Bright, lively colour with gentle polish",
                "editorial": {
                    "family": "Editorial Day",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
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
                                "blue": {
                                    "chroma": 0.15
                                },
                                "aqua": {
                                    "chroma": 0.15
                                }
                            }
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.55,
                "brows": 0.4,
                "lips": 0.2
            },
            "sparkle": null,
            "recipe": {
                "id": "PL07",
                "name": "Megève",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 7,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Clean alpine clarity with cool highlights",
                "editorial": {
                    "family": "Masthead",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.whiteBalance",
                        "params": {
                            "temperature": -0.08
                        }
                    },
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.3,
                            "chroma": -0.2
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": 0.05
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.45,
            "emphasis": {
                "eyes": 0.45,
                "brows": 0.35,
                "lips": 0.3
            },
            "sparkle": null,
            "recipe": {
                "id": "PL08",
                "name": "Mougins",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 8,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Golden-hour warmth with a soft highlight glow",
                "editorial": {
                    "family": "Cover Evening",
                    "light": "Evening"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.whiteBalance",
                        "params": {
                            "temperature": 0.22,
                            "tint": 0.05
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 30,
                            "shadowAmount": 0.02,
                            "highlightHue": 70,
                            "highlightAmount": 0.04,
                            "balance": 0
                        }
                    },
                    {
                        "op": "spatial.glow",
                        "params": {
                            "amount": 0.3,
                            "warmth": 0.5
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.5,
            "emphasis": {
                "eyes": 0.4,
                "brows": 0.3,
                "lips": 0.35
            },
            "sparkle": null,
            "recipe": {
                "id": "PL09",
                "name": "Riquewihr",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 9,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Rosy storybook warmth, polished but textured",
                "editorial": {
                    "family": "Salon Suite",
                    "light": "Studio"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.tint",
                        "params": {
                            "hue": 10,
                            "amount": 0.025
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 350,
                            "shadowAmount": 0.015,
                            "highlightHue": 20,
                            "highlightAmount": 0.02,
                            "balance": 0
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": 0.1
                        }
                    },
                    {
                        "op": "colour.curve",
                        "params": {
                            "master": [
                                [
                                    0,
                                    0
                                ],
                                [
                                    0.3,
                                    0.29
                                ],
                                [
                                    0.7,
                                    0.71
                                ],
                                [
                                    1,
                                    0.98
                                ]
                            ]
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.45,
                "brows": 0.35,
                "lips": 0.2
            },
            "sparkle": null,
            "recipe": {
                "id": "PL10",
                "name": "Moustiers",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 10,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Faience-blue shadows with warm skin kept",
                "editorial": {
                    "family": "Heritage",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 240,
                            "shadowAmount": 0.04,
                            "highlightHue": 80,
                            "highlightAmount": 0.015,
                            "balance": 0
                        }
                    },
                    {
                        "op": "colour.saturation",
                        "params": {
                            "amount": -0.12
                        }
                    },
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.25
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.5,
                "brows": 0.5,
                "lips": 0.25
            },
            "sparkle": null,
            "recipe": {
                "id": "PL11",
                "name": "Hossegor",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 11,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Sun-warmed surf glow with defined brows",
                "editorial": {
                    "family": "Editorial Day",
                    "light": "Studio"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.whiteBalance",
                        "params": {
                            "temperature": 0.18
                        }
                    },
                    {
                        "op": "colour.vibrance",
                        "params": {
                            "amount": 0.12
                        }
                    },
                    {
                        "op": "spatial.glow",
                        "params": {
                            "amount": 0.25,
                            "warmth": 0.4
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.55,
            "emphasis": {
                "eyes": 0.35,
                "brows": 0.3,
                "lips": 0.2
            },
            "sparkle": null,
            "recipe": {
                "id": "PL12",
                "name": "Yvoire",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 12,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Lakeside soft-focus glow with lifted colour",
                "editorial": {
                    "family": "Salon Suite",
                    "light": "Window"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
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
                            "threshold": 0.65
                        }
                    },
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.2
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 200,
                            "shadowAmount": 0.02,
                            "highlightHue": 50,
                            "highlightAmount": 0.02,
                            "balance": 0
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        },
        {
            "polish": 0.4,
            "emphasis": {
                "eyes": 0.6,
                "brows": 0.45,
                "lips": 0.3
            },
            "sparkle": {
                "density": 0.3,
                "amount": 0.85,
                "seed": 20261027,
                "palette": [
                    [
                        255,
                        232,
                        190
                    ],
                    [
                        255,
                        214,
                        170
                    ],
                    [
                        246,
                        226,
                        255
                    ]
                ]
            },
            "recipe": {
                "id": "PL13",
                "name": "Vence",
                "version": 1,
                "class": 1,
                "tab": "Beauty",
                "status": "Build",
                "round": "FX10",
                "rank": 13,
                "like": {
                    "score": 3,
                    "source": "assumed",
                    "reason": "Own portrait look; no arena run yet"
                },
                "description": "Evening look with fine sparkle on lids and cheekbones",
                "editorial": {
                    "family": "Cover Evening",
                    "light": "Evening"
                },
                "defaults": {
                    "strength": 30,
                    "guard": true,
                    "protectSkin": false,
                    "backgroundOnly": false,
                    "addons": []
                },
                "limits": {
                    "strengthMax": 100,
                    "geometry": "none",
                    "simulationLabel": true,
                    "funTab": false,
                    "guardMode": "full"
                },
                "needs": {
                    "landmarks": true,
                    "masks": [
                        "face-skin"
                    ],
                    "depth": false,
                    "camera": false,
                    "clip": false
                },
                "stages": [
                    {
                        "op": "colour.highlightRolloff",
                        "params": {
                            "amount": 0.35
                        }
                    },
                    {
                        "op": "colour.splitTone",
                        "params": {
                            "shadowHue": 260,
                            "shadowAmount": 0.04,
                            "highlightHue": 45,
                            "highlightAmount": 0.03,
                            "balance": 0
                        }
                    },
                    {
                        "op": "light.vignette",
                        "params": {
                            "amount": 0.3
                        }
                    }
                ],
                "presets": [],
                "seed": "photo",
                "safety": {
                    "eyesClear": true,
                    "faceClear": true
                },
                "provenance": {
                    "writtenFrom": "filters-plan.md recipe schema; own curve points and grade values for the portrait looks",
                    "answers": [],
                    "concepts": [
                        "own curve points baked to a LUT by the filter engine"
                    ]
                }
            }
        }
    ]
};
