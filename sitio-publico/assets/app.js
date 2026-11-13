(() => {
  'use strict';

  const settings = window.APP_CONFIG || {
    records: [],
    preview: true,
    demo: true
  };

  const records = Array.isArray(settings.records)
    ? settings.records
    : [];

  const farmRecords = Array.isArray(settings.farms)
    ? settings.farms
    : [
        ...new Map(
          records.map(fila => [
            `${fila.region}|${fila.c_finca}`,
            fila
          ])
        ).values()
      ].map(fila => ({
        ...fila,
        modulos_totales: records.filter(modulo =>
          modulo.region === fila.region &&
          String(modulo.c_finca) === String(fila.c_finca)
        ).length
      }));

  const $ = id => document.getElementById(id);

  const region = $('region');
  const finca = $('finca');
  const modulo = $('modulo');

  const peopleContent = $('people-content');
  const deviceList = $('device-list');
  const phonesNow = $('phones-now');
  const submit = $('submit-btn');
  const formHint = $('form-hint');

  let selected = null;
  let processedSelection = null;
  let toastTimeout;

  function addOption(select, label, value) {
    const option = document.createElement('option');
    option.textContent = label;
    option.value = value;
    select.append(option);
  }

  function resetSelect(select, prompt) {
    select.replaceChildren();
    addOption(select, prompt, '');
    select.value = '';
    select.disabled = true;
  }

  function countOf(row) {
    if (
      row.personas_asignadas === null ||
      row.personas_asignadas === '' ||
      row.personas_asignadas === undefined
    ) {
      return null;
    }

    const cantidad = Number(row.personas_asignadas);

    return Number.isInteger(cantidad) && cantidad >= 0
      ? cantidad
      : null;
  }

  // Pedidos parciales: la base devuelve lo ya registrado y lo pendiente del modulo.
  // Se cuenta por telefonos: si un modulo pedido completo sube de 5 a 6 personas,
  // siguen siendo los mismos 3 celulares. Sin esos datos se asume que no hay pedidos.
  function wholeNumber(value) {
    if (value === null || value === undefined || value === '') return null;

    const cantidad = Number(value);

    return Number.isInteger(cantidad) && cantidad >= 0 ? cantidad : null;
  }

  function registeredPeople(row) {
    return wholeNumber(row.personas_registradas) ?? 0;
  }

  function pendingPeople(row) {
    const count = countOf(row);

    if (count === null) return null;

    return wholeNumber(row.personas_pendientes) ??
      Math.max(count - registeredPeople(row), 0);
  }

  function totalPhones(row) {
    const count = countOf(row);

    return count === null ? null : Math.ceil(count / 2);
  }

  function pendingPhones(row) {
    const count = countOf(row);

    if (count === null) return null;

    return wholeNumber(row.celulares_pendientes) ??
      Math.ceil(pendingPeople(row) / 2);
  }

  function moduleLabel(row) {
    if (pendingPhones(row) === totalPhones(row)) return row.codigo_modulo;

    const pending = pendingPhones(row);
    const total = totalPhones(row);

    return `${row.codigo_modulo} · quedan ${pending} de ${total} ` +
      (total === 1 ? 'celular' : 'celulares');
  }

  function plural(cantidad, uno, varios) {
    return `${cantidad} ${cantidad === 1 ? uno : varios}`;
  }

  function resetModule() {
    selected = null;

    $('module-details').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
    $('data-alert').classList.add('hidden');

    peopleContent.classList.add('hidden');
    deviceList.replaceChildren();
    $('partial-picker').classList.add('hidden');
    phonesNow.replaceChildren();

    $('people-count').textContent = '—';
    $('phone-count').textContent = '—';

    $('step-people').classList.remove('active');
    $('step-review').classList.remove('active');

    formHint.textContent =
      'Selecciona una ubicación para comenzar el registro.';

    submit.disabled = true;
  }

  function farmsForRegion() {
    return [
      ...new Map(
        farmRecords
          .filter(fila => fila.region === region.value)
          .map(fila => [String(fila.c_finca), fila])
      ).values()
    ].sort((a, b) => a.finca.localeCompare(b.finca, 'es'));
  }

  function refreshRegions() {
    resetSelect(
      region,
      farmRecords.length
        ? 'Seleccionar región'
        : 'No hay fincas disponibles'
    );

    const regiones = [
      ...new Set(farmRecords.map(fila => fila.region))
    ].sort((a, b) => a.localeCompare(b, 'es'));

    regiones.forEach(valor => {
      addOption(region, valor, valor);
    });

    region.disabled = farmRecords.length === 0;
    region.dispatchEvent(new Event('change'));

    if (!farmRecords.length) {
      formHint.textContent =
        'No hay fincas asignadas o disponibles para tu usuario.';
    }
  }

  function removeProcessed(row) {
    const index = records.indexOf(row);

    if (index !== -1) {
      records.splice(index, 1);
    }

    refreshRegions();
  }

  region.addEventListener('change', () => {
    resetSelect(finca, 'Seleccionar finca');
    resetSelect(modulo, 'Primero selecciona una finca');
    resetModule();

    if (!region.value) {
      resetSelect(finca, 'Primero selecciona una región');
      return;
    }

    farmsForRegion().forEach(fila => {
      addOption(
        finca,
        `${fila.finca} · ${fila.c_finca}`,
        String(fila.c_finca)
      );
    });

    finca.disabled = false;
  });

  finca.addEventListener('change', () => {
    resetSelect(
      modulo,
      finca.value
        ? 'Seleccionar módulo'
        : 'Primero selecciona una finca'
    );

    resetModule();

    if (!finca.value) return;

    const disponibles = records.filter(fila =>
      fila.region === region.value &&
      String(fila.c_finca) === finca.value
    );

    if (!disponibles.length) {
      const asignada = farmRecords.find(fila =>
        fila.region === region.value &&
        String(fila.c_finca) === finca.value
      );

      const sinCatalogo =
        Number(asignada?.modulos_totales ?? 0) === 0;

      resetSelect(
        modulo,
        sinCatalogo
          ? 'Sin módulos en el catálogo'
          : 'Sin módulos pendientes'
      );

      formHint.textContent = sinCatalogo
        ? 'Esta finca está asignada a tu usuario, pero no tiene módulos cargados en el catálogo.'
        : 'Esta finca está asignada a tu usuario, pero todos sus módulos ya tienen solicitudes registradas.';

      return;
    }

    disponibles
      .sort((a, b) =>
        a.codigo_modulo.localeCompare(b.codigo_modulo, 'es')
      )
      .forEach(fila => {
        addOption(
          modulo,
          moduleLabel(fila),
          fila.codigo_modulo
        );
      });

    modulo.disabled = false;
  });

  modulo.addEventListener('change', () => {
    resetModule();

    if (!modulo.value) return;

    selected = records.find(fila =>
      fila.region === region.value &&
      String(fila.c_finca) === finca.value &&
      fila.codigo_modulo === modulo.value
    );

    if (!selected) return;

    $('module-details').classList.remove('hidden');
    $('selected-module').textContent = selected.codigo_modulo;

    $('selected-farm').textContent =
      `${selected.finca} · ${selected.region} · finca ${selected.c_finca}`;

    $('selected-irrigation').textContent =
      selected.tipo_riego || 'Sin tipo de riego';

    $('empty-state').classList.add('hidden');

    const count = countOf(selected);

    $('people-count').textContent =
      count === null ? 'Sin dato' : count;

    $('phone-count').textContent =
      count === null ? '—' : pendingPhones(selected);

    if (count === null || count === 0) {
      $('data-alert').classList.remove('hidden');

      $('data-alert').textContent = count === null
        ? 'Este módulo no tiene un número válido de personas asignadas. Corregir o agregar datos antes de registrar la solicitud.'
        : 'Este módulo tiene 0 personas asignadas. No corresponde registrar celulares para esta ubicación.';

      formHint.textContent =
        'Revisa las personas asignadas en la base de datos.';

      return;
    }

    peopleContent.classList.remove('hidden');
    $('step-people').classList.add('active');

    // Pedido parcial: el jefe elige cuantos de los celulares pendientes pide ahora.
    const pending = pendingPhones(selected);
    const yaPedidos = totalPhones(selected) - pending;

    for (let cantidad = pending; cantidad >= 1; cantidad--) {
      addOption(
        phonesNow,
        plural(cantidad, 'celular', 'celulares') +
          (cantidad === pending
            ? (yaPedidos ? ' (todos los pendientes)' : ' (todos)')
            : ''),
        String(cantidad)
      );
    }

    phonesNow.value = String(pending);
    $('partial-picker').classList.toggle('hidden', pending < 2);

    renderDevices();
  });

  phonesNow.addEventListener('change', renderDevices);

  function phonesRequested() {
    const pending = pendingPhones(selected);
    const cantidad = Number(phonesNow.value);

    return Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= pending
      ? cantidad
      : pending;
  }

  function peopleRequested() {
    return Math.min(phonesRequested() * 2, pendingPeople(selected));
  }

  function renderDevices() {
    if (!selected) return;

    // Conserva lo ya escrito si el jefe cambia la cantidad de celulares.
    const escritos = {};

    deviceList.querySelectorAll('.person-input').forEach(input => {
      escritos[`${input.dataset.person}|${input.dataset.field}`] = input.value;
    });

    deviceList.replaceChildren();

    const count = countOf(selected);
    const phones = phonesRequested();
    const people = peopleRequested();
    const pending = pendingPhones(selected);
    const yaPedidos = totalPhones(selected) - pending;
    const resto = pending - phones;

    $('allocation-text').textContent =
      `${plural(count, 'persona asignada', 'personas asignadas')} · ` +
      `${plural(totalPhones(selected), 'celular', 'celulares')} en total` +
      (yaPedidos
        ? ` · ya ${yaPedidos === 1 ? 'se pidió 1' : `se pidieron ${yaPedidos}`}`
        : '') +
      ` · ahora: ${plural(phones, 'celular', 'celulares')} para ` +
      `${plural(people, 'colaborador', 'colaboradores')}` +
      (resto
        ? `. ${resto === 1 ? 'Queda 1' : `Quedan ${resto}`} para pedir después.`
        : '.') +
      (people % 2 ? ' El último celular corresponde a una sola persona.' : '');

    for (let device = 0; device < phones; device++) {
      createDevice(device, people, yaPedidos, registeredPeople(selected));
    }

    deviceList.querySelectorAll('.person-input').forEach(input => {
      const valor = escritos[`${input.dataset.person}|${input.dataset.field}`];

      if (valor) input.value = valor;
    });

    $('phone-count').textContent = phones;

    updateValidation();
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (content !== undefined) {
      node.textContent = content;
    }

    return node;
  }

  // phoneOffset y personOffset solo cambian la numeracion visible, para que
  // continue despues de lo ya pedido; data-person sigue siendo 0..count-1.
  function createDevice(index, count, phoneOffset = 0, personOffset = 0) {
    const card = element('div', 'device-card');
    const header = element('div', 'device-header');

    header.append(
      element(
        'strong',
        '',
        `Celular ${String(phoneOffset + index + 1).padStart(2, '0')}`
      ),
      element(
        'span',
        '',
        index * 2 + 1 === count
          ? '1 colaborador'
          : '2 colaboradores'
      )
    );

    card.append(header);

    const body = element('div', 'device-body');

    for (
      let offset = 0;
      offset < 2 && index * 2 + offset < count;
      offset++
    ) {
      const personIndex = index * 2 + offset;
      const row = element('div', 'person-row');

      row.append(
        element(
          'span',
          'person-number',
          String(personOffset + personIndex + 1)
        )
      );

      const campos = [
        ['nombre', 'Nombre del colaborador', 'Nombre completo'],
        ['codigo', 'Código del colaborador', 'Ej. COL-001']
      ];

      for (const [key, label, placeholder] of campos) {
        const field = element('label');
        field.append(element('span', '', label));

        const input = element('input', 'person-input');

        input.type = 'text';
        input.placeholder = placeholder;
        input.required = true;
        input.maxLength = key === 'nombre' ? 120 : 40;
        input.autocomplete = 'off';
        input.dataset.person = personIndex;
        input.dataset.field = key;

        input.setAttribute(
          'aria-label',
          `${label} ${personOffset + personIndex + 1}`
        );

        field.append(input);
        row.append(field);
      }

      body.append(row);
    }

    card.append(body);
    deviceList.append(card);
  }

  function updateValidation() {
    const inputs = [
      ...deviceList.querySelectorAll('.person-input')
    ];

    const codes = inputs
      .filter(input => input.dataset.field === 'codigo')
      .map(input => input.value.trim().toLocaleLowerCase('es'));

    const complete =
      inputs.length > 0 &&
      inputs.every(input => input.value.trim());

    const unique = new Set(codes).size === codes.length;

    submit.disabled = !(complete && unique);

    $('step-review').classList.toggle(
      'active',
      !submit.disabled
    );

    if (!complete) {
      formHint.textContent =
        'Completa los datos de todos los colaboradores para registrar.';
    } else if (!unique) {
      formHint.textContent =
        'Revisa los códigos: hay colaboradores repetidos.';
    } else {
      formHint.textContent =
        'Todo listo para registrar la solicitud.';
    }
  }

  deviceList.addEventListener('input', updateValidation);

  function notify(message) {
    const box = $('toast');

    box.textContent = message;
    box.classList.add('show');

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
      box.classList.remove('show');
    }, 4500);
  }

  submit.addEventListener('click', async () => {
    if (!selected || submit.disabled) return;

    const people = peopleRequested();
    const phones = phonesRequested();

    const colaboradores = Array.from(
      { length: people },
      (_, index) => ({
        nombre: deviceList.querySelector(
          `[data-person="${index}"][data-field="nombre"]`
        ).value.trim(),

        codigo: deviceList.querySelector(
          `[data-person="${index}"][data-field="codigo"]`
        ).value.trim()
      })
    );

    const celulares = Array.from(
      { length: phones },
      () => ({ inventario: '' })
    );

    let recordId = 'VISTA PREVIA';

    if (!settings.preview) {
      submit.disabled = true;
      submit.querySelector('span').textContent = 'Guardando...';

      try {
        if (settings.supabaseClient) {
          const { data, error } =
            await settings.supabaseClient.rpc(
              'registrar_solicitud',
              {
                p_region: selected.region,
                p_c_finca: String(selected.c_finca),
                p_codigo_modulo: selected.codigo_modulo,
                p_colaboradores: colaboradores,
                p_celulares: celulares
              }
            );

          if (error) {
            const esDuplicado =
              error.code === '23505' ||
              (
                error.code === 'P0001' &&
                [
                  'Ya existe una solicitud para el módulo seleccionado.',
                  'Este módulo ya no tiene celulares pendientes.'
                ].includes(error.message)
              );

            const fallo = new Error(
              esDuplicado
                ? 'Este módulo ya no tiene celulares pendientes.'
                : error.message
            );

            fallo.status = esDuplicado ? 409 : 500;
            throw fallo;
          }

          recordId = data;
        } else {
          const response = await fetch(
            settings.submitUrl || 'index.php',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': settings.csrf
              },
              body: JSON.stringify({
                module_key: [
                  selected.region,
                  selected.c_finca,
                  selected.codigo_modulo
                ].join('|'),
                colaboradores,
                celulares
              })
            }
          );

          const result = await response.json();

          if (!response.ok || !result.ok) {
            const fallo = new Error(
              result.message || 'No se pudo guardar.'
            );

            fallo.status = response.status;
            throw fallo;
          }

          recordId = result.id;
        }
      } catch (error) {
        notify(error.message || 'Error de conexión.');

        if (error.status === 409) {
          removeProcessed(selected);
        } else {
          updateValidation();
        }

        return;
      } finally {
        submit.querySelector('span').textContent =
          'Registrar solicitud';
      }
    }

    processedSelection = selected;

    // Lo pedido ya cuenta: el modulo sigue en la lista solo si le quedan celulares.
    const quedan = pendingPhones(selected) - phones;

    selected.personas_pendientes = pendingPeople(selected) - people;
    selected.celulares_pendientes = quedan;
    selected.personas_registradas = registeredPeople(selected) + people;

    $('success-text').textContent =
      `${plural(phones, 'celular solicitado', 'celulares solicitados')} ` +
      `para ${plural(people, 'colaborador', 'colaboradores')} ` +
      `en ${selected.codigo_modulo}. ` +
      (quedan
        ? `En este módulo ${quedan === 1 ? 'queda 1 celular' : `quedan ${quedan} celulares`} por pedir. `
        : '') +
      `Referencia: ${recordId}.`;

    $('success-modal').classList.remove('hidden');
    $('new-entry').focus();
  });

  $('new-entry').addEventListener('click', () => {
    $('success-modal').classList.add('hidden');

    if (processedSelection) {
      if (pendingPhones(processedSelection) > 0) {
        refreshRegions();
      } else {
        removeProcessed(processedSelection);
      }
    }

    processedSelection = null;

    if (!region.disabled) {
      region.focus();
    }
  });

  $('success-modal').addEventListener('click', evento => {
    if (evento.target === $('success-modal')) {
      $('new-entry').click();
    }
  });

  document.addEventListener('keydown', evento => {
    if (
      evento.key === 'Escape' &&
      !$('success-modal').classList.contains('hidden')
    ) {
      $('new-entry').click();
    }
  });

  refreshRegions();

  $('mode-note').textContent = settings.preview
    ? 'Vista previa interactiva: el registro se simula y no se guarda. Abre index.php mediante un servidor PHP para guardar solicitudes.'
    : settings.supabaseClient
      ? 'Catálogo y solicitudes conectados a Supabase.'
      : settings.demo
        ? 'Datos de ejemplo tomados de las capturas. Los registros se guardan en data/solicitudes.jsonl.'
        : 'Catálogo conectado a la base de datos configurada. Los registros se guardan en data/solicitudes.jsonl.';
})();