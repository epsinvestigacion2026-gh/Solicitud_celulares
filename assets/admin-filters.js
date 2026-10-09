(() => {
  const region = document.getElementById('filter-region');
  const farm = document.getElementById('filter-farm');
  const module = document.getElementById('filter-module');
  if (!region || !farm || !module) return;

  function updateOptions() {
    for (const option of farm.options) {
      if (!option.value) continue;
      option.hidden = option.disabled = !!region.value && option.dataset.region !== region.value;
    }
    if (farm.selectedOptions[0]?.disabled) farm.value = '';
    for (const option of module.options) {
      if (!option.value) continue;
      const wrongRegion = !!region.value && option.dataset.region !== region.value;
      const wrongFarm = !!farm.value && option.dataset.farm !== farm.value;
      option.hidden = option.disabled = wrongRegion || wrongFarm;
    }
    if (module.selectedOptions[0]?.disabled) module.value = '';
  }

  region.addEventListener('change', () => { farm.value = ''; module.value = ''; updateOptions(); });
  farm.addEventListener('change', () => { module.value = ''; updateOptions(); });
  updateOptions();
})();
