/**
 * Shared action-button appearance (check, retry, show feedback) for H5P.QuestionCFRD.
 * Must load after question-cfrd.js (helpers attach to the Question constructor).
 */
(function ($) {
  if (!H5P.QuestionCFRD) {
    return;
  }
  var CUSTOM_CLASS = 'h5p-action-buttons-custom';
  var RADIUS_UNIT = 'em';

  var DEFAULTS = {
    useGradientBackground: false,
    gradientBackground: {
      angle: 180,
      colorStart: '#1a73d9',
      colorEnd: '#1a73d9'
    },
    backgroundColor: '#1a73d9',
    textColor: '#ffffff',
    hoverBackgroundColor: '#1356a3',
    hoverTextColor: '#ffffff',
    useBorder: false,
    borderSettings: {
      borderColor: '#1a73d9',
      hoverBorderColor: '#1356a3'
    },
    borderRadius: '2em'
  };

  var CSS_VARS = [
    '--h5p-q-btn-bg',
    '--h5p-q-btn-text',
    '--h5p-q-btn-hover-bg',
    '--h5p-q-btn-hover-text',
    '--h5p-q-btn-border-color',
    '--h5p-q-btn-hover-border-color',
    '--h5p-q-btn-border-width',
    '--h5p-q-btn-radius'
  ];

  function isTruthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function pickString(value, fallback) {
    return (value === undefined || value === null || value === '') ? fallback : String(value);
  }

  function pickBoolean(value, fallback) {
    return (value === undefined || value === null || value === '') ? fallback : isTruthy(value);
  }

  function normalizeAngle(value, fallback) {
    var normalized = parseInt(value, 10);

    if (isNaN(normalized)) {
      normalized = fallback;
    }

    return Math.max(0, Math.min(360, normalized));
  }

  function buildLinearGradient(angle, colorStart, colorEnd) {
    return 'linear-gradient(' + angle + 'deg, ' + colorStart + ', ' + colorEnd + ')';
  }

  function normalizeGradientConfig(gradient, fallback) {
    var normalized = $.extend({}, fallback || {}, gradient || {});
    normalized.angle = normalizeAngle(
      normalized.angle,
      fallback && fallback.angle !== undefined ? fallback.angle : 180
    );
    normalized.colorStart = pickString(
      normalized.colorStart,
      fallback && fallback.colorStart ? fallback.colorStart : '#ffffff'
    );
    normalized.colorEnd = pickString(
      normalized.colorEnd,
      fallback && fallback.colorEnd ? fallback.colorEnd : normalized.colorStart
    );
    return normalized;
  }

  function normalizeRadius(value, fallback) {
    var normalized = value;

    if (normalized === undefined || normalized === null || normalized === '') {
      normalized = fallback;
    }

    if (typeof normalized === 'number' && !isNaN(normalized)) {
      return normalized + RADIUS_UNIT;
    }

    normalized = String(normalized).trim();

    if (!normalized) {
      return fallback;
    }

    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      return normalized + RADIUS_UNIT;
    }

    return normalized;
  }

  /**
   * @param {Object} [appearance]
   * @returns {boolean}
   */
  H5P.QuestionCFRD.hasActionButtonAppearance = function (appearance) {
    return !!(appearance && typeof appearance === 'object');
  };

  /**
   * @param {Object} [appearance]
   * @returns {Object}
   */
  H5P.QuestionCFRD.normalizeActionButtonAppearance = function (appearance) {
    var normalized = $.extend(true, {}, DEFAULTS, appearance || {});

    normalized.backgroundColor = pickString(normalized.backgroundColor, DEFAULTS.backgroundColor);
    normalized.textColor = pickString(normalized.textColor, DEFAULTS.textColor);
    normalized.hoverBackgroundColor = pickString(
      normalized.hoverBackgroundColor,
      DEFAULTS.hoverBackgroundColor
    );
    normalized.hoverTextColor = pickString(normalized.hoverTextColor, DEFAULTS.hoverTextColor);
    normalized.useBorder = pickBoolean(normalized.useBorder, DEFAULTS.useBorder);
    normalized.borderSettings = $.extend({}, DEFAULTS.borderSettings, normalized.borderSettings || {});
    normalized.borderSettings.borderColor = pickString(
      normalized.borderSettings.borderColor,
      DEFAULTS.borderSettings.borderColor
    );
    normalized.borderSettings.hoverBorderColor = pickString(
      normalized.borderSettings.hoverBorderColor,
      DEFAULTS.borderSettings.hoverBorderColor
    );
    normalized.borderRadius = normalizeRadius(normalized.borderRadius, DEFAULTS.borderRadius);

    normalized.useGradientBackground = pickBoolean(
      normalized.useGradientBackground,
      DEFAULTS.useGradientBackground
    );
    normalized.gradientBackground = normalizeGradientConfig(
      normalized.gradientBackground,
      DEFAULTS.gradientBackground
    );

    if (normalized.useGradientBackground) {
      normalized.backgroundColor = buildLinearGradient(
        normalized.gradientBackground.angle,
        normalized.gradientBackground.colorStart,
        normalized.gradientBackground.colorEnd
      );
    }

    return normalized;
  };

  /**
   * @param {HTMLElement|jQuery} target
   */
  H5P.QuestionCFRD.clearActionButtonAppearance = function (target) {
    var $target = target && target.jquery ? target : $(target);
    var el = $target && $target.length ? $target[0] : null;
    var i;

    if (!el || !el.style) {
      return;
    }

    el.classList.remove(CUSTOM_CLASS);

    for (i = 0; i < CSS_VARS.length; i++) {
      el.style.removeProperty(CSS_VARS[i]);
    }
  };

  /**
   * @param {HTMLElement|jQuery} target Buttons container
   * @param {Object} [appearance]
   */
  H5P.QuestionCFRD.applyActionButtonAppearance = function (target, appearance) {
    var normalized = H5P.QuestionCFRD.normalizeActionButtonAppearance(appearance);
    var $target = target && target.jquery ? target : $(target);
    var el = $target && $target.length ? $target[0] : null;

    if (!el || !el.style) {
      return;
    }

    el.classList.add(CUSTOM_CLASS);
    el.style.setProperty('--h5p-q-btn-bg', normalized.backgroundColor);
    el.style.setProperty('--h5p-q-btn-text', normalized.textColor);
    el.style.setProperty('--h5p-q-btn-hover-bg', normalized.hoverBackgroundColor);
    el.style.setProperty('--h5p-q-btn-hover-text', normalized.hoverTextColor);
    el.style.setProperty('--h5p-q-btn-border-color', normalized.borderSettings.borderColor);
    el.style.setProperty(
      '--h5p-q-btn-hover-border-color',
      normalized.borderSettings.hoverBorderColor
    );
    el.style.setProperty('--h5p-q-btn-border-width', normalized.useBorder ? '2px' : '0');
    el.style.setProperty('--h5p-q-btn-radius', normalized.borderRadius);
  };
})(H5P.jQuery);
