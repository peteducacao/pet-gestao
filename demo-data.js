/* DADOS DE DEMONSTRAÇÃO — material fornecido pelo usuário; não há integração com serviço de e-mail nem banco de dados. */
window.PET_GESTAO_DEMO = {
  "users": [
    {
      "id": "andreza",
      "name": "Andreza"
    },
    {
      "id": "lara",
      "name": "Lara"
    },
    {
      "id": "lene",
      "name": "Lene"
    },
    {
      "id": "joao-vitor",
      "name": "João Vitor"
    },
    {
      "id": "luiz",
      "name": "Luiz"
    },
    {
      "id": "dayane",
      "name": "Dayane"
    },
    {
      "id": "gabriel",
      "name": "Gabriel"
    },
    {
      "id": "ysadora",
      "name": "Ysadora"
    },
    {
      "id": "sergio",
      "name": "Sérgio"
    }
  ],
  "committees": [
    {
      "id": "legendas",
      "name": "Legendas",
      "memberIds": [
        "lara",
        "andreza"
      ],
      "description": "Cronograma de postagens e revisões"
    }
  ],
  "meetings": [
    {
      "id": "memoria-2026-10-22",
      "title": "Memória do encontro de quinta-feira",
      "date": "2026-10-22",
      "rawNotes": "*MEMÓRIA DO ENCONTRO DE QUINTA-FEIRA (22.10.2026)*\n\n• *(até 29.10) Projetos para a Mostra do dia 30.10:* verificar a necessidade de reserva de mesas e outros materiais, além de confirmar o horário da Mostra. Os projetos deverão estar finalizados até o dia 29 de outubro.\n\n* No dia 22.10, os projetos estavam sendo testados e ajustados.\n\n*Situação dos projetos:*\n\n-> Emoji: OK.\n\n-> Condomínio: falta finalizar. Responsável: (Ysadora).\n\n-> Lixeira: OK.\n\n-> Semáforo: OK.\n\n• *Projetos para a MNR:*\n\n-> *(até 11.11) Banner da Lixeira:* produção do banner. Responsável: (João Vitor).\n\n-> *(até 11.11) Banner da Estufa:* produção do banner. Responsável: (Andreza).\n\n-> *(até 12.11) Panfletos e adesivos:* produção dos materiais. Responsável: (Luiz).\n\n-> *(até 16.11) Impressão dos banners:* realizar a impressão dos banners. Responsável: (Dayane).\n\n-> *(até 19.11) Organização da Estufa:* organizar e finalizar o projeto. Responsável: (Gabriel).\n\n-> *(até 19.11) Organização da Lixeira:* adquirir 6 sensores PIR, 10 servomotores e \n\nEVA vermelho. Responsável: (Dayane ).\n\n• *Produção de chaveiros:* a produção permanece em andamento. Responsável: (Comissão).\n\n• *Organização dos kits das crianças:*\n\n-> Realizar os testes com o ESP32. Responsável: (Gabriel).\n\n-> Separar os motores DC e realizar a soldagem, caso necessário. Responsável: (???).\n\n• *Planejamento dos encontros de robótica com as crianças:* a construção dos carrinhos será realizada sem a etapa de testes no simulador. Os encontros ocorrerão nos dias 4, 11 e 18 de novembro. Verificar se haverá reposição de aulas. Responsável: (???).",
      "taskIds": [
        "mem-mostra-mesas",
        "mem-emoji",
        "mem-condominio",
        "mem-lixeira",
        "mem-semaforo",
        "mem-banner-lixeira",
        "mem-banner-estufa",
        "mem-panfletos",
        "mem-impressao-banners",
        "mem-organizacao-estufa",
        "mem-organizacao-lixeira",
        "mem-chaveiros",
        "mem-esp32",
        "mem-motores",
        "mem-encontros"
      ]
    }
  ],
  "tasks": [
    {
      "id": "mem-mostra-mesas",
      "title": "Mostra de Robótica: mesas e horário",
      "description": "Verificar necessidade de reserva de mesas e outros materiais e confirmar o horário da Mostra de 30/10.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-10-29T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        }
      ]
    },
    {
      "id": "mem-emoji",
      "title": "Projeto Emoji",
      "description": "Situação anotada na memória: OK.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Concluída",
      "status": "concluida",
      "assigneeIds": [],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-10-29T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        }
      ]
    },
    {
      "id": "mem-condominio",
      "title": "Projeto Condomínio",
      "description": "Falta finalizar o projeto para a Mostra de Robótica.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "ysadora"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-10-29T23:59:00",
          "assigneeName": "Ysadora",
          "assigneeId": "ysadora"
        }
      ]
    },
    {
      "id": "mem-lixeira",
      "title": "Projeto Lixeira",
      "description": "Situação anotada na memória: OK.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Concluída",
      "status": "concluida",
      "assigneeIds": [],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-10-29T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        }
      ]
    },
    {
      "id": "mem-semaforo",
      "title": "Projeto Semáforo",
      "description": "Situação anotada na memória: OK.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Concluída",
      "status": "concluida",
      "assigneeIds": [],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-10-29T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        }
      ]
    },
    {
      "id": "mem-banner-lixeira",
      "title": "Banner da Lixeira (MNR)",
      "description": "Produção do banner da Lixeira para a MNR.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "joao-vitor"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-11T23:59:00",
          "assigneeName": "João Vitor",
          "assigneeId": "joao-vitor"
        }
      ]
    },
    {
      "id": "mem-banner-estufa",
      "title": "Banner da Estufa (MNR)",
      "description": "Produção do banner da Estufa para a MNR.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-11T23:59:00",
          "assigneeName": "Andreza",
          "assigneeId": "andreza"
        }
      ]
    },
    {
      "id": "mem-panfletos",
      "title": "Panfletos e adesivos da MNR",
      "description": "Produção dos materiais de divulgação.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "luiz"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-12T23:59:00",
          "assigneeName": "Luiz",
          "assigneeId": "luiz"
        }
      ]
    },
    {
      "id": "mem-impressao-banners",
      "title": "Impressão dos banners da MNR",
      "description": "Realizar a impressão dos banners.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "dayane"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-16T23:59:00",
          "assigneeName": "Dayane",
          "assigneeId": "dayane"
        }
      ]
    },
    {
      "id": "mem-organizacao-estufa",
      "title": "Organização da Estufa",
      "description": "Organizar e finalizar o projeto.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "gabriel"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-19T23:59:00",
          "assigneeName": "Gabriel",
          "assigneeId": "gabriel"
        }
      ]
    },
    {
      "id": "mem-organizacao-lixeira",
      "title": "Organização da Lixeira",
      "description": "Adquirir 6 sensores PIR, 10 servomotores e EVA vermelho.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "dayane"
      ],
      "deadlines": [
        {
          "label": "Prazo",
          "dueAt": "2026-11-19T23:59:00",
          "assigneeName": "Dayane",
          "assigneeId": "dayane"
        }
      ]
    },
    {
      "id": "mem-chaveiros",
      "title": "Produção de chaveiros",
      "description": "Produção em andamento. Responsabilidade coletiva (comissão).",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [],
      "deadlines": []
    },
    {
      "id": "mem-esp32",
      "title": "Testes com ESP32 para os kits",
      "description": "Testar o ESP32 para os kits das crianças.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [
        "gabriel"
      ],
      "deadlines": []
    },
    {
      "id": "mem-motores",
      "title": "Motores DC e soldagem",
      "description": "Separar os motores DC e realizar soldagem, caso necessário. Responsável a definir.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [],
      "deadlines": []
    },
    {
      "id": "mem-encontros",
      "title": "Planejamento dos encontros de robótica",
      "description": "Construção de carrinhos sem etapa de testes no simulador. Encontros em 4, 11 e 18 de novembro; verificar reposição de aulas. Responsável a definir.",
      "committeeId": null,
      "meetingId": "memoria-2026-10-22",
      "registeredAt": "2026-10-22",
      "stageName": "Pendente",
      "status": "pendente",
      "assigneeIds": [],
      "deadlines": []
    },
    {
      "id": "leg-mostra",
      "title": "Mostra de Robótica: registro do evento",
      "description": "Publicação sobre a Mostra de Robótica realizada na sexta-feira (06/11).",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-09",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": []
    },
    {
      "id": "leg-cine-fora",
      "title": "CINE PET fora da casinha",
      "description": "Postagem com fotos do encontro de 09/11.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-10",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": []
    },
    {
      "id": "leg-livros-11",
      "title": "PET Indica Livros",
      "description": "Quadro PET Indica Livros.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-11",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": [
        {
          "label": "Produção — ImaginAÇÃO",
          "dueAt": "2026-11-08T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-10T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-criancas-11",
      "title": "Encontro com as crianças: fotos",
      "description": "Postagem com fotos do encontro.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-11",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — Andreza",
          "dueAt": "2026-11-08T23:59:00",
          "assigneeName": "Andreza",
          "assigneeId": "andreza"
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-10T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-tbt",
      "title": "TBT: Conectando Saberes",
      "description": "Postagem com fotos.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-12",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": []
    },
    {
      "id": "leg-foto",
      "title": "Formação de Fotografia",
      "description": "Formação com Sérgio e Andreza. Carrossel de fotos e Reels.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-12",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "sergio"
      ],
      "deadlines": []
    },
    {
      "id": "leg-filmes-13",
      "title": "PET Indica Filmes",
      "description": "Quadro PET Indica Filmes.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-13",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — CINE PET",
          "dueAt": "2026-11-09T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-11T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-agitte-card",
      "title": "Chamada para o AGITTE",
      "description": "Card de divulgação do AGITTE.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-16",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — Comissões",
          "dueAt": "2026-11-13T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-15T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-aniversario",
      "title": "Aniversário de Jeanderson",
      "description": "Card de aniversário. O cronograma original registra 'Pene' como responsável pela correção; confirmar antes de atribuir.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-16",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": [
        {
          "label": "Produção — Comissões",
          "dueAt": "2026-11-14T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Pene (confirmar)",
          "dueAt": "2026-11-15T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        }
      ]
    },
    {
      "id": "leg-mnr-card",
      "title": "Chamada para a MNR",
      "description": "Card de divulgação da MNR.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-17",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": [
        {
          "label": "Produção — Comissões",
          "dueAt": "2026-11-14T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-16T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-livros-18",
      "title": "PET Indica Livros",
      "description": "Quadro PET Indica Livros.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-18",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — ImaginAÇÃO",
          "dueAt": "2026-11-14T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-16T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-criancas-18",
      "title": "Encontro com as crianças: vídeo",
      "description": "Postagem com vídeo.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-18",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — Andreza",
          "dueAt": "2026-11-15T23:59:00",
          "assigneeName": "Andreza",
          "assigneeId": "andreza"
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-17T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-interpet-card",
      "title": "Chamada para o INTERPET",
      "description": "Card de divulgação do INTERPET.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-19",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — Comissões",
          "dueAt": "2026-11-16T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-18T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-filmes-20",
      "title": "PET Indica Filmes",
      "description": "Quadro PET Indica Filmes.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-20",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": [
        {
          "label": "Produção — CINE PET",
          "dueAt": "2026-11-16T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-18T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-agitte-evento",
      "title": "Evento do AGITTE",
      "description": "Definir qual será o formato da publicação.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-23",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": []
    },
    {
      "id": "leg-mnr-cobertura",
      "title": "Cobertura da MNR",
      "description": "Evento com duração de 5 dias (23–27/11). Definir formatos de postagem e responsáveis.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-23",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [],
      "deadlines": []
    },
    {
      "id": "leg-livros-25",
      "title": "PET Indica Livros",
      "description": "Quadro PET Indica Livros.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-25",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "lara"
      ],
      "deadlines": [
        {
          "label": "Produção — ImaginAÇÃO",
          "dueAt": "2026-11-21T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-23T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-criancas-25",
      "title": "Encontro com as crianças",
      "description": "Definir o formato da postagem.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-25",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": []
    },
    {
      "id": "leg-filmes-27",
      "title": "PET Indica Filmes",
      "description": "Quadro PET Indica Filmes.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-27",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": [
        {
          "label": "Produção — CINE PET",
          "dueAt": "2026-11-23T23:59:00",
          "assigneeName": "",
          "assigneeId": null
        },
        {
          "label": "Correção — Lene",
          "dueAt": "2026-11-25T23:59:00",
          "assigneeName": "Lene",
          "assigneeId": "lene"
        }
      ]
    },
    {
      "id": "leg-interpet",
      "title": "INTERPET",
      "description": "Postagem do INTERPET. Formato não informado.",
      "committeeId": "legendas",
      "registeredAt": "2026-11-01",
      "postingAt": "2026-11-27",
      "status": "pendente",
      "stageName": "Programada",
      "assigneeIds": [
        "andreza"
      ],
      "deadlines": []
    }
  ],
  "events": [],
  "session": null
};
