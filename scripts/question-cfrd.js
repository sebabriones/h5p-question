H5P.Tooltip = H5P.Tooltip || function() {};

H5P.QuestionCFRD = (function ($, EventDispatcher, JoubelUI) {

  /**
   * Extending this class make it alot easier to create tasks for other
   * content types.
   *
   * @class H5P.QuestionCFRD
   * @extends H5P.EventDispatcher
   * @param {string} type
   */
  function Question(type) {
    var self = this;

    // Inheritance
    EventDispatcher.call(self);

    // Register default section order
    self.order = ['video', 'image', 'audio', 'introduction', 'content', 'explanation', 'feedback', 'scorebar', 'buttons', 'read'];

    // Keep track of registered sections
    var sections = {};

    // Buttons
    var buttons = {};
    var buttonOrder = [];

    // Wrapper when attached
    var $wrapper;

    // Click element
    var clickElement;

    // ScoreBar
    var scoreBar;

    // Keep track of the feedback's visual status.
    var showFeedback;

    // Keep track of which buttons are scheduled for hiding.
    var buttonsToHide = [];

    // Keep track of which buttons are scheduled for showing.
    var buttonsToShow = [];

    // Keep track of the hiding and showing of buttons.
    var toggleButtonsTimer;
    var toggleButtonsTransitionTimer;
    var buttonTruncationTimer;
    var buttonsSectionReservedMinHeight = '';
    var buttonsPrePopupFooterReserve = '';
    var BUTTONS_SECTION_FALLBACK_MIN_HEIGHT = '3.14286em';
    var SCOREBAR_ROW_FALLBACK_MIN_HEIGHT = '4em';

    // Keeps track of initialization of question
    var initialized = false;

    /**
     * @type {Object} behaviour Behaviour of Question
     * @property {Boolean} behaviour.disableFeedback Set to true to disable feedback section
     */
    var behaviour = {
      disableFeedback: false,
      disableReadSpeaker: false
    };

    // Keeps track of thumb state
    var imageThumb = true;

    // Keeps track of image transitions
    var imageTransitionTimer;

    // Keep track of whether sections is transitioning.
    var sectionsIsTransitioning = false;

    // Keep track of auto play state
    var disableAutoPlay = false;

    // Feedback transition timer
    var feedbackTransitionTimer;

    // Dismissible feedback popup state (summary popups without click anchor)
    var feedbackPopupDismissible = false;
    var feedbackPopupOnClose = null;
    var feedbackPopupPresentation = null;
    var actionButtonAppearanceConfig = null;

    /**
     * Apply shared action-button appearance to the buttons section.
     * @private
     */
    var applyActionButtonAppearanceToButtons = function () {
      if (!sections.buttons ||
          !sections.buttons.$element ||
          !sections.buttons.$element.length) {
        return;
      }

      if (typeof H5P.QuestionCFRD.hasActionButtonAppearance !== 'function' ||
          typeof H5P.QuestionCFRD.applyActionButtonAppearance !== 'function') {
        return;
      }

      if (!H5P.QuestionCFRD.hasActionButtonAppearance(actionButtonAppearanceConfig)) {
        if (typeof H5P.QuestionCFRD.clearActionButtonAppearance === 'function') {
          H5P.QuestionCFRD.clearActionButtonAppearance(sections.buttons.$element);
        }
        return;
      }

      H5P.QuestionCFRD.applyActionButtonAppearance(
        sections.buttons.$element,
        actionButtonAppearanceConfig
      );
    };

    // Used when reading messages to the user
    var $read, readText;

    /**
     * Register section with given content.
     *
     * @private
     * @param {string} section ID of the section
     * @param {(string|H5P.jQuery)} [content]
     */
    var register = function (section, content) {
      sections[section] = {};
      var $e = sections[section].$element = $('<div/>', {
        'class': 'h5p-question-' + section,
      });
      if (content) {
        $e[content instanceof $ ? 'append' : 'html'](content);
      }
    };

    /**
     * Update registered section with content.
     *
     * @private
     * @param {string} section ID of the section
     * @param {(string|H5P.jQuery)} content
     */
    var update = function (section, content) {
      if (content instanceof $) {
        sections[section].$element.html('').append(content);
      }
      else {
        sections[section].$element.html(content);
      }
    };

    /**
     * Insert element with given ID into the DOM.
     *
     * @private
     * @param {array|Array|string[]} order
     * List with ordered element IDs
     * @param {string} id
     * ID of the element to be inserted
     * @param {Object} elements
     * Maps ID to the elements
     * @param {H5P.jQuery} $container
     * Parent container of the elements
     */
    var insert = function (order, id, elements, $container) {
      // Try to find an element id should be after
      for (var i = 0; i < order.length; i++) {
        if (order[i] === id) {
          // Found our pos
          while (i > 0 &&
          (elements[order[i - 1]] === undefined ||
          !elements[order[i - 1]].isVisible)) {
            i--;
          }
          if (i === 0) {
            // We are on top.
            elements[id].$element.prependTo($container);
          }
          else {
            // Add after element
            elements[id].$element.insertAfter(elements[order[i - 1]].$element);
          }
          prepareButtonElementForShow(id);
          elements[id].isVisible = true;
          break;
        }
      }
    };

    /**
     * Hide a dismissible feedback popup without removing it from the DOM.
     *
     * @private
     * @param {H5P.jQuery} $element
     * @param {H5P.jQuery} $tail
     */
    var hideDismissibleFeedbackPopup = function ($element, $tail) {
      $element.removeClass('h5p-question-visible h5p-question-popup-open');
      $tail.hide();

      if (sections.scorebar) {
        sections.scorebar.$element.removeClass('h5p-question-visible').css('max-height', '');
        sections.scorebar.isVisible = false;
      }

      if (sections.buttons) {
        sections.buttons.$element.removeClass('has-scorebar');
      }

      syncButtonsFooterReserveForFeedbackPopup();

      if (feedbackPopupOnClose) {
        feedbackPopupOnClose();
      }

      schedulePopupFooterReserveSync();
    };

    /**
     * Apply popup background for styled overall feedback.
     *
     * @private
     * @param {object} [presentation]
     */
    var applyFeedbackPopupPresentation = function (presentation) {
      if (!presentation || !sections.feedback) {
        return;
      }

      var $element = sections.feedback.$element;
      var $parent = sections.content.$element;

      if (presentation.popupBackgroundColor) {
        $element.css('background-color', presentation.popupBackgroundColor);
        if ($parent) {
          $parent.find('.h5p-question-feedback-tail').css('background-color', presentation.popupBackgroundColor);
        }
      }
    };

    /**
     * Measure popup height without locking max-height (overall feedback popups).
     *
     * @private
     * @param {H5P.jQuery} $element
     * @return {number}
     */
    var measureFeedbackPopupHeight = function ($element) {
      $element.css('max-height', 'none');
      return Math.round($element.outerHeight());
    };

    /**
     * Run callback after overall feedback images inside the popup have loaded.
     *
     * @private
     * @param {H5P.jQuery} $element
     * @param {function} callback
     */
    var whenFeedbackImagesReady = function ($element, callback) {
      var $images = $element.find('.h5p-overall-feedback__image');
      var pending = 0;
      var i;
      var img;

      if (!$images.length) {
        callback();
        return;
      }

      var checkDone = function () {
        pending--;
        if (pending <= 0) {
          callback();
        }
      };

      for (i = 0; i < $images.length; i++) {
        img = $images[i];
        if (img.complete) {
          continue;
        }
        pending++;
        $($images[i]).one('load error', checkDone);
      }

      if (pending === 0) {
        callback();
      }
    };

    /**
     * Finalize popup layout after scorebar height is known.
     *
     * @private
     * @param {H5P.jQuery} $element
     */
    var finalizeFeedbackPopupLayout = function ($element) {
      if (sections.scorebar) {
        sections.scorebar.$element.css('max-height', 'none');
      }

      $element.css('max-height', 'none');

      var $click = (clickElement != null ? clickElement.$element : null);

      whenFeedbackImagesReady($element, function () {
        positionFeedbackPopup($element, $click);
        syncButtonsFooterReserveForFeedbackPopup(buttonsPrePopupFooterReserve);
        schedulePopupFooterReserveSync();
      });
    };

    /**
     * Make feedback into a popup and position relative to click.
     *
     * @private
     * @param {object} [popupSettings]
     * @param {string} [popupSettings.closeText] Text for the close button
     * @param {boolean} [popupSettings.alwaysShowClose] Always show the close button
     * @param {boolean} [popupSettings.dismissible] Hide popup on close instead of removing it
     * @param {function} [popupSettings.onClose] Called when a dismissible popup is closed
     */
    var makeFeedbackPopup = function (popupSettings) {
      popupSettings = popupSettings || {};
      var closeText = popupSettings.closeText;

      feedbackPopupDismissible = popupSettings.dismissible === true;
      feedbackPopupOnClose = popupSettings.onClose || null;

      var $element = sections.feedback.$element;
      var $parent = sections.content.$element;
      var $click = (clickElement != null ? clickElement.$element : null);

      $element.appendTo($parent).addClass('h5p-question-popup');

      if (sections.scorebar) {
        sections.scorebar.$element.appendTo($element);
        showSection(sections.scorebar);
      }

      $parent.addClass('h5p-has-question-popup');

      // Draw the tail
      var $tail = $('<div/>', {
        'class': 'h5p-question-feedback-tail'
      }).hide()
        .appendTo($parent);

      var dismissPopup = function (event) {
        if (event) {
          event.preventDefault();
        }

        if (feedbackPopupDismissible) {
          hideDismissibleFeedbackPopup($element, $tail);
        }
        else {
          $element.remove();
          $tail.remove();
        }
      };

      // Draw the close button
      var $close = $('<div/>', {
        'class': 'h5p-question-feedback-close',
        'tabindex': 0,
        'title': closeText,
        on: {
          click: dismissPopup,
          keydown: function (event) {
            switch (event.which) {
              case 13: // Enter
              case 32: // Space
                dismissPopup(event);
            }
          }
        }
      }).hide().appendTo($element);

      if ($click != null) {
        if ($click.hasClass('correct')) {
          $element.addClass('h5p-question-feedback-correct');
          $close.show();
          sections.buttons.$element.hide();
        }
        else {
          sections.buttons.$element.appendTo(sections.feedback.$element);
        }
      }
      else if (popupSettings.alwaysShowClose) {
        $element.addClass('h5p-question-feedback-correct');
        $close.show();
      }

      $element.addClass('h5p-question-popup-open');
      applyFeedbackPopupPresentation(popupSettings);
    };

    /**
     * Position the feedback popup.
     *
     * @private
     * @param {H5P.jQuery} $element Feedback div
     * @param {H5P.jQuery} $click Visual click div
     */
    var positionFeedbackPopup = function ($element, $click) {
      var $container = $element.parent();
      var $tail = $element.siblings('.h5p-question-feedback-tail');
      var popupWidth = $element.outerWidth();
      var popupHeight = measureFeedbackPopupHeight($element);
      var space = 15;
      var disableTail = false;
      var positionY = $container.height() / 2 - popupHeight / 2;
      var positionX = $container.width() / 2 - popupWidth / 2;
      var tailX = 0;
      var tailY = 0;
      var tailRotation = 0;

      if ($click != null) {
        // Edge detection for click, takes space into account
        var clickNearTop = ($click[0].offsetTop < space);
        var clickNearBottom = ($click[0].offsetTop + $click.height() > $container.height() - space);
        var clickNearLeft = ($click[0].offsetLeft < space);
        var clickNearRight = ($click[0].offsetLeft + $click.width() > $container.width() - space);

        // Click is not in a corner or close to edge, calculate position normally
        positionX = $click[0].offsetLeft - popupWidth / 2  + $click.width() / 2;
        positionY = $click[0].offsetTop - popupHeight - space;
        tailX = positionX + popupWidth / 2 - $tail.width() / 2;
        tailY = positionY + popupHeight - ($tail.height() / 2);
        tailRotation = 225;

        // If popup is outside top edge, position under click instead
        if (popupHeight + space > $click[0].offsetTop) {
          positionY = $click[0].offsetTop + $click.height() + space;
          tailY = positionY - $tail.height() / 2 ;
          tailRotation = 45;
        }

        // If popup is outside left edge, position left
        if (positionX < 0) {
          positionX = 0;
        }

        // If popup is outside right edge, position right
        if (positionX + popupWidth > $container.width()) {
          positionX = $container.width() - popupWidth;
        }

        // Special cases such as corner clicks, or close to an edge, they override X and Y positions if met
        if (clickNearTop && (clickNearLeft || clickNearRight)) {
          positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() : -popupWidth);
          positionY = $click[0].offsetTop + $click.height();
          disableTail = true;
        }
        else if (clickNearBottom && (clickNearLeft || clickNearRight)) {
          positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() : -popupWidth);
          positionY = $click[0].offsetTop - popupHeight;
          disableTail = true;
        }
        else if (!clickNearTop && !clickNearBottom) {
          if (clickNearLeft || clickNearRight) {
            positionY = $click[0].offsetTop - popupHeight / 2 + $click.width() / 2;
            positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() + space : -popupWidth + -space);
            // Make sure this does not position the popup off screen
            if (positionX < 0) {
              positionX = 0;
              disableTail = true;
            }
            else {
              tailX = positionX + (clickNearLeft ? - $tail.width() / 2 : popupWidth - $tail.width() / 2);
              tailY = positionY + popupHeight / 2 - $tail.height() / 2;
              tailRotation = (clickNearLeft ? 315 : 135);
            }
          }
        }

        // Contain popup from overflowing bottom edge
        if (positionY + popupHeight > $container.height()) {
          positionY = $container.height() - popupHeight;

          if (popupHeight > $container.height() - ($click[0].offsetTop + $click.height() + space)) {
            disableTail = true;
          }
        }
      }
      else {
        disableTail = true;
      }

      // Contain popup from ovreflowing top edge
      if (positionY < 0) {
        positionY = 0;
      }

      $element.css({top: positionY, left: positionX});
      $tail.css({top: tailY, left: tailX});

      if (!disableTail) {
        $tail.css({
          'left': tailX,
          'top': tailY,
          'transform': 'rotate(' + tailRotation + 'deg)'
        }).show();
      }
      else {
        $tail.hide();
      }
    };

    /**
     * Set element max height, used for animations.
     *
     * @param {H5P.jQuery} $element
     */
    var setElementHeight = function ($element) {
      if (!$element.is(':visible')) {
        // No animation
        $element.css('max-height', 'none');
        return;
      }

      // All action buttons hidden: keep reserved footer height (do not measure 0).
      if ($element.hasClass('h5p-question-buttons-all-hidden')) {
        var reservedMax = $element.css('min-height');
        $element.css('max-height', reservedMax && reservedMax !== '0px' ? reservedMax : 'none');
        return;
      }

      // If this element is shown in the popup, we can't set width to 100%,
      // since it already has a width set in CSS
      var isFeedbackPopup = $element.hasClass('h5p-question-popup');

      if (isFeedbackPopup) {
        return measureFeedbackPopupHeight($element);
      }

      // Get natural element height
      var $tmp = $element.clone()
        .css({
          'position': 'absolute',
          'max-height': 'none',
          'width': isFeedbackPopup ? '' : '100%'
        })
        .appendTo($element.parent());

      // Need to take margins into account when calculating available space
      var sideMargins = parseFloat($element.css('margin-left'))
        + parseFloat($element.css('margin-right'));
      var tmpElWidth = $tmp.css('width') ? $tmp.css('width') : '100%';
      $tmp.css('width', 'calc(' + tmpElWidth + ' - ' + sideMargins + 'px)');

      // Apply height to element
      var h = Math.round($tmp.get(0).getBoundingClientRect().height);
      var fontSize = parseFloat($element.css('fontSize'));
      var relativeH = h / fontSize;
      $element.css('max-height', relativeH + 'em');
      $tmp.remove();

      if (h > 0 && sections.buttons && sections.buttons.$element === $element) {
        // Make sure buttons section is visible
        showSection(sections.buttons);

        // Resize buttons after resizing button section
        setTimeout(resizeButtons, 150);
      }
      return h;
    };

    /**
     * Does the actual job of hiding the buttons scheduled for hiding.
     *
     * @private
     * @param {boolean} [relocateFocus] Find a new button to focus
     */
    var hideButtons = function (relocateFocus) {
      for (var i = 0; i < buttonsToHide.length; i++) {
        hideButton(buttonsToHide[i].id);
      }
      buttonsToHide = [];

      if (relocateFocus) {
        self.focusButton();
      }
    };

    /**
     * Ensure a button element is mounted in the buttons section.
     * @private
     * @param {string} buttonId
     */
    var ensureButtonMounted = function (buttonId) {
      var button = buttons[buttonId];

      if (!button || !button.$element || !button.$element.length || !sections.buttons) {
        return;
      }

      if (!button.$element.parent().length) {
        button.$element.appendTo(sections.buttons.$element);
      }
    };

    /**
     * Hide a button in the DOM without unmounting (keeps footer height stable).
     * @private
     * @param {string} buttonId
     */
    var hideButtonElement = function (buttonId) {
      var button = buttons[buttonId];

      if (!button || !button.$element || !button.$element.length) {
        return;
      }

      ensureButtonMounted(buttonId);

      button.$element
        .addClass('h5p-question-button-hidden')
        .attr('aria-hidden', 'true')
        .attr('tabindex', '-1');
    };

    /**
     * Prepare a button element before showing (remove stale hidden state).
     * @private
     * @param {string} buttonId
     */
    var prepareButtonElementForShow = function (buttonId) {
      var button = buttons[buttonId];

      if (!button || !button.$element || !button.$element.length) {
        return;
      }

      ensureButtonMounted(buttonId);

      button.$element
        .removeClass('h5p-question-button-hidden')
        .removeAttr('aria-hidden')
        .removeAttr('tabindex');
    };

    /**
     * Count buttons that will stay visible after the pending hide operations.
     * @private
     * @returns {number}
     */
    var countButtonsVisibleAfterHide = function () {
      var remain = 0;

      for (var id in buttons) {
        if (!buttons.hasOwnProperty(id) || !buttons[id].isVisible) {
          continue;
        }

        var scheduledHide = false;
        for (var h = 0; h < buttonsToHide.length; h++) {
          if (buttonsToHide[h].id === id) {
            scheduledHide = true;
            break;
          }
        }

        if (!scheduledHide) {
          remain += 1;
        }
      }

      return remain;
    };

    /**
     * Capture current buttons section height in em units.
     * @private
     * @param {H5P.jQuery} $element
     * @returns {string}
     */
    var pxToEm = function ($element, heightPx) {
      var fontSize = parseFloat($element.css('fontSize')) || 16;
      return (heightPx / fontSize) + 'em';
    };

    /**
     * @private
     * @param {H5P.jQuery} $element
     * @param {string} value
     * @returns {number}
     */
    var parseCssLengthToPx = function ($element, value) {
      if (!value || value === 'none' || value === '0px') {
        return 0;
      }

      var fontSize = parseFloat($element.css('fontSize')) || 16;
      var parsed = parseFloat(value);

      if (isNaN(parsed)) {
        return 0;
      }

      if (String(value).indexOf('em') !== -1) {
        return parsed * fontSize;
      }

      return parsed;
    };

    /**
     * @private
     * @param {H5P.jQuery} $element
     * @param {string} heightA
     * @param {string} heightB
     * @returns {string}
     */
    var combineHeightsEm = function ($element, heightA, heightB) {
      var totalPx = parseCssLengthToPx($element, heightA) + parseCssLengthToPx($element, heightB);

      if (totalPx <= 0) {
        return BUTTONS_SECTION_FALLBACK_MIN_HEIGHT;
      }

      return pxToEm($element, totalPx);
    };

    /**
     * Measure scorebar row height (used when scorebar moves into feedback popup).
     * @private
     * @returns {string}
     */
    var measureScorebarRowHeightEm = function () {
      if (!sections.scorebar || !sections.scorebar.$element || !sections.scorebar.$element.length) {
        return '';
      }

      var $scorebar = sections.scorebar.$element;
      var heightPx = Math.ceil($scorebar.outerHeight(true));

      if (heightPx <= 0) {
        return '';
      }

      var $ref = (sections.buttons && sections.buttons.$element && sections.buttons.$element.length)
        ? sections.buttons.$element
        : $scorebar;

      return pxToEm($ref, heightPx);
    };

    /**
     * Apply reserved footer height on the buttons section.
     * @private
     * @param {H5P.jQuery} $btnSection
     * @param {string} reservedHeight
     */
    var applyButtonsSectionReserve = function ($btnSection, reservedHeight) {
      if (!$btnSection || !$btnSection.length || !reservedHeight) {
        return;
      }

      $btnSection.addClass('h5p-question-buttons-all-hidden');
      $btnSection.css({
        'min-height': reservedHeight,
        'max-height': reservedHeight
      });
      buttonsSectionReservedMinHeight = reservedHeight;
      showSection(sections.buttons);
    };

    /**
     * Keep footer height when scorebar is inside the feedback popup (scorebar is not in footer).
     * @private
     * @param {string} [buttonReserveOverride]
     */
    var syncButtonsFooterReserveForFeedbackPopup = function (buttonReserveOverride) {
      if (!sections.buttons || !sections.buttons.$element) {
        return;
      }

      var $btnSection = sections.buttons.$element;

      if (!$btnSection.hasClass('h5p-question-buttons-all-hidden')) {
        return;
      }

      var buttonReserve = buttonReserveOverride
        || buttonsPrePopupFooterReserve
        || buttonsSectionReservedMinHeight
        || BUTTONS_SECTION_FALLBACK_MIN_HEIGHT;

      applyButtonsSectionReserve($btnSection, buttonReserve);
    };

    /**
     * Re-measure footer reserve after popup layout has settled.
     * @private
     */
    var schedulePopupFooterReserveSync = function () {
      var sync = function () {
        syncButtonsFooterReserveForFeedbackPopup(buttonsPrePopupFooterReserve);
        self.trigger('resize');
      };

      if (typeof window.requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          requestAnimationFrame(sync);
        });
      }
      else {
        setTimeout(sync, 32);
      }
    };

    var captureButtonsSectionHeight = function ($element) {
      if (!$element || !$element.length) {
        return '';
      }

      var heightPx = Math.round($element.get(0).getBoundingClientRect().height);
      if (heightPx <= 0) {
        var maxHeight = $element.css('max-height');
        return (maxHeight && maxHeight !== 'none' && maxHeight !== '0px') ? maxHeight : '';
      }

      return pxToEm($element, heightPx);
    };

    /**
     * Reserve footer height before hiding every action button (nodes stay in DOM).
     * @private
     * @param {H5P.jQuery} $btnSection
     * @returns {string}
     */
    var reserveButtonsSectionHeight = function ($btnSection) {
      if (!$btnSection || !$btnSection.length) {
        return buttonsSectionReservedMinHeight || BUTTONS_SECTION_FALLBACK_MIN_HEIGHT;
      }

      showSection(sections.buttons);

      var maxButtonPx = Math.ceil($btnSection.outerHeight(true));
      if (maxButtonPx < 0) {
        maxButtonPx = 0;
      }

      for (var id in buttons) {
        if (!buttons.hasOwnProperty(id)) {
          continue;
        }

        var button = buttons[id];
        if (!button.$element || !button.$element.length) {
          continue;
        }

        if (button.$element.hasClass('h5p-question-button-hidden')) {
          continue;
        }

        var buttonHeight = Math.ceil(button.$element.outerHeight(true));
        if (buttonHeight > maxButtonPx) {
          maxButtonPx = buttonHeight;
        }
      }

      if (maxButtonPx > 0) {
        buttonsSectionReservedMinHeight = pxToEm($btnSection, maxButtonPx);
        return buttonsSectionReservedMinHeight;
      }

      var sectionHeight = captureButtonsSectionHeight($btnSection);
      if (sectionHeight) {
        buttonsSectionReservedMinHeight = sectionHeight;
        return sectionHeight;
      }

      var $sample = $btnSection.children('.h5p-joubelui-button').first();
      if ($sample.length) {
        var $clone = $sample.clone()
          .removeClass('h5p-question-button-hidden')
          .attr('aria-hidden', 'true')
          .css({
            visibility: 'hidden',
            position: 'absolute',
            left: '-9999px',
            top: 0,
            width: 'auto',
            height: 'auto',
            margin: 0,
            padding: null,
            border: 0,
            overflow: 'visible',
            clip: 'auto',
            clipPath: 'none'
          })
          .appendTo(document.body);
        var cloneHeight = Math.ceil($clone.outerHeight(true));
        $clone.remove();

        if (cloneHeight > 0) {
          buttonsSectionReservedMinHeight = pxToEm($btnSection, cloneHeight);
          return buttonsSectionReservedMinHeight;
        }
      }

      return buttonsSectionReservedMinHeight || BUTTONS_SECTION_FALLBACK_MIN_HEIGHT;
    };

    /**
     * Clear reserved min-height on the buttons section.
     * @private
     * @param {H5P.jQuery} $element
     */
    var clearButtonsSectionReserve = function ($element) {
      if (!$element || !$element.length) {
        return;
      }

      $element.css({
        'min-height': '',
        'max-height': ''
      });
      $element.removeClass('h5p-question-buttons-all-hidden');
    };

    /**
     * Does the actual hiding (stay in DOM, no interaction).
     * @private
     * @param {string} buttonId
     */
    var hideButton = function (buttonId) {
      if (!buttons[buttonId]) {
        return;
      }

      hideButtonElement(buttonId);
      buttons[buttonId].isVisible = false;
    };

    /**
     * Shows the buttons on the next tick. This is to avoid buttons flickering
     * If they're both added and removed on the same tick.
     *
     * @private
     */
    var toggleButtons = function () {
      // If no buttons section, return
      if (sections.buttons === undefined) {
        return;
      }

      // Clear transition timer, reevaluate pending button visibility changes
      clearTimeout(toggleButtonsTransitionTimer);

      if (buttonsToShow.length && sections.buttons.$element) {
        clearButtonsSectionReserve(sections.buttons.$element);
      }

      // Show buttons
      for (var i = 0; i < buttonsToShow.length; i++) {
        var showId = buttonsToShow[i].id;

        prepareButtonElementForShow(showId);
        insert(buttonOrder, showId, buttons, sections.buttons.$element);
        buttons[showId].isVisible = true;
      }
      buttonsToShow = [];

      // Hide buttons
      var remainVisible = countButtonsVisibleAfterHide();
      var relocateFocus = false;
      for (var j = 0; j < buttonsToHide.length; j++) {
        var button = buttons[buttonsToHide[j].id];
        if (button.$element.is(':focus')) {
          // Move focus to the first visible button.
          relocateFocus = true;
        }
      }

      var animationTimer = 150;
      if (sections.feedback && sections.feedback.$element.hasClass('h5p-question-popup')) {
        animationTimer = 0;
      }

      var $btnSection = sections.buttons.$element;

      if (remainVisible === 0 && buttonsToHide.length > 0) {
        // All buttons hidden in flow: keep nodes in DOM, reserve footer height.
        var reservedHeight = $btnSection.children().length
          ? reserveButtonsSectionHeight($btnSection)
          : (buttonsSectionReservedMinHeight || BUTTONS_SECTION_FALLBACK_MIN_HEIGHT);

        hideButtons(relocateFocus);
        applyButtonsSectionReserve($btnSection, reservedHeight);

        resizeButtons();

        toggleButtonsTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, animationTimer);
      }
      else {
        hideButtons(relocateFocus);
        clearButtonsSectionReserve($btnSection);

        showSection(sections.buttons);
        setElementHeight($btnSection);

        var activeSectionHeight = captureButtonsSectionHeight($btnSection);
        if (activeSectionHeight) {
          buttonsSectionReservedMinHeight = activeSectionHeight;
          buttonsPrePopupFooterReserve = activeSectionHeight;
        }

        toggleButtonsTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, animationTimer);

        resizeButtons();
      }

      toggleButtonsTimer = undefined;
    };

    /**
     * Allows for scaling of the question image.
     */
    var scaleImage = function () {
      var $imgSection = sections.image.$element;
      clearTimeout(imageTransitionTimer);

      // Add this here to avoid initial transition of the image making
      // content overflow. Alternatively we need to trigger a resize.
      $imgSection.addClass('animatable');

      if (imageThumb) {

        // Expand image
        $(this).attr('aria-expanded', true);
        $imgSection.addClass('h5p-question-image-fill-width');
        imageThumb = false;

        imageTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, 600);
      }
      else {

        // Scale down image
        $(this).attr('aria-expanded', false);
        $imgSection.removeClass('h5p-question-image-fill-width');
        imageThumb = true;

        imageTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, 600);
      }
    };

    /**
     * Get scrollable ancestor of element
     *
     * @private
     * @param {H5P.jQuery} $element
     * @param {Number} [currDepth=0] Current recursive calls to ancestor, stop at maxDepth
     * @param {Number} [maxDepth=5] Maximum depth for finding ancestor.
     * @returns {H5P.jQuery} Parent element that is scrollable
     */
    var findScrollableAncestor = function ($element, currDepth, maxDepth) {
      if (!currDepth) {
        currDepth = 0;
      }
      if (!maxDepth) {
        maxDepth = 5;
      }
      // Check validation of element or if we have reached document root
      if (!$element || !($element instanceof $) || document === $element.get(0) || currDepth >= maxDepth) {
        return;
      }

      if ($element.css('overflow-y') === 'auto') {
        return $element;
      }
      else {
        return findScrollableAncestor($element.parent(), currDepth + 1, maxDepth);
      }
    };

    /**
     * Scroll to bottom of Question.
     *
     * @private
     */
    var scrollToBottom = function () {
      if (!$wrapper || ($wrapper.hasClass('h5p-standalone') && !H5P.isFullscreen)) {
        return; // No scroll
      }

      var scrollableAncestor = findScrollableAncestor($wrapper);

      // Scroll to bottom of scrollable ancestor
      if (scrollableAncestor) {
        scrollableAncestor.animate({
          scrollTop: $wrapper.css('height')
        }, "slow");
      }
    };

    /**
     * Resize buttons to fit container width
     *
     * @private
     */
    var resizeButtons = function () {
      if (!buttons || !sections.buttons) {
        return;
      }

      var go = function () {
        // Don't do anything if button elements are not visible yet
        if (!sections.buttons.$element.is(':visible')) {
          return;
        }

        // Width of all buttons
        var buttonsWidth = {
          max: 0,
          min: 0,
          current: 0
        };

        for (var i in buttons) {
          var button = buttons[i];
          if (button.isVisible) {
            setButtonWidth(buttons[i]);
            buttonsWidth.max += button.width.max;
            buttonsWidth.min += button.width.min;
            buttonsWidth.current += button.isTruncated ? button.width.min : button.width.max;
          }
        }

        var makeButtonsFit = function (availableWidth) {
          if (buttonsWidth.max < availableWidth) {
            // It is room for everyone on the right side of the score bar (without truncating)
            if (buttonsWidth.max !== buttonsWidth.current) {
              // Need to make everyone big
              restoreButtonLabels(buttonsWidth.current, availableWidth);
            }
            return true;
          }
          else if (buttonsWidth.min < availableWidth) {
            // Is it room for everyone on the right side of the score bar with truncating?
            if (buttonsWidth.current > availableWidth) {
              removeButtonLabels(buttonsWidth.current, availableWidth);
            }
            else {
              restoreButtonLabels(buttonsWidth.current, availableWidth);
            }
            return true;
          }
          return false;
        };

        toggleFullWidthScorebar(false);

        var buttonSectionWidth = Math.floor(sections.buttons.$element.width()) - 1;

        if (!makeButtonsFit(buttonSectionWidth)) {
          // If we get here we need to wrap:
          toggleFullWidthScorebar(true);
          buttonSectionWidth = Math.floor(sections.buttons.$element.width()) - 1;
          makeButtonsFit(buttonSectionWidth);
        }
      };

      // If visible, resize right away
      if (sections.buttons.$element.is(':visible')) {
        go();
      }
      else { // If not visible, try on the next tick
        // Clear button truncation timer if within a button truncation function
        if (buttonTruncationTimer) {
          clearTimeout(buttonTruncationTimer);
        }
        buttonTruncationTimer = setTimeout(function () {
          buttonTruncationTimer = undefined;
          go();
        }, 0);
      }
    };

    var toggleFullWidthScorebar = function (enabled) {
      if (sections.scorebar &&
          sections.scorebar.$element &&
          sections.scorebar.$element.hasClass('h5p-question-visible')) {
        sections.buttons.$element.addClass('has-scorebar');
        sections.buttons.$element.toggleClass('wrap', enabled);
        sections.scorebar.$element.toggleClass('full-width', enabled);
      }
      else {
        sections.buttons.$element.removeClass('has-scorebar');
      }
    };

    /**
     * Remove button labels until they use less than max width.
     *
     * @private
     * @param {Number} buttonsWidth Total width of all buttons
     * @param {Number} maxButtonsWidth Max width allowed for buttons
     */
    var removeButtonLabels = function (buttonsWidth, maxButtonsWidth) {
      // Reverse traversal
      for (var i = buttonOrder.length - 1; i >= 0; i--) {
        var buttonId = buttonOrder[i];
        var button = buttons[buttonId];
        if (!button.isTruncated && button.isVisible) {
          var $button = button.$element;
          buttonsWidth -= button.width.max - button.width.min;
          // Set tooltip (needed by H5P.Tooltip)
          let buttonText = $button.text();
          $button.attr('data-tooltip', buttonText);

          // Use button text as aria label if a specific one isn't provided
          if (!button.ariaLabel) {
            $button.attr('aria-label', buttonText);
          }
          // Remove label
          $button.html('').addClass('truncated');
          button.isTruncated = true;
          if (buttonsWidth <= maxButtonsWidth) {
            // Buttons are small enough.
            return;
          }
        }
      }
    };

    /**
     * Restore button labels until it fills maximum possible width without exceeding the max width.
     *
     * @private
     * @param {Number} buttonsWidth Total width of all buttons
     * @param {Number} maxButtonsWidth Max width allowed for buttons
     */
    var restoreButtonLabels = function (buttonsWidth, maxButtonsWidth) {
      for (var i = 0; i < buttonOrder.length; i++) {
        var buttonId = buttonOrder[i];
        var button = buttons[buttonId];
        if (button.isTruncated && button.isVisible) {
          // Calculate new total width of buttons with a static pixel for consistency cross-browser
          buttonsWidth += button.width.max - button.width.min + 1;

          if (buttonsWidth > maxButtonsWidth) {
            return;
          }
          // Restore label
          button.$element.html(button.text);

          // Remove tooltip (used by H5P.Tooltip)
          button.$element.removeAttr('data-tooltip');

          // Remove aria-label if a specific one isn't provided
          if (!button.ariaLabel) {
            button.$element.removeAttr('aria-label');
          }

          button.$element.removeClass('truncated');
          button.isTruncated = false;
        }
      }
    };

    /**
     * Helper function for finding index of keyValue in array
     *
     * @param {String} keyValue Value to be found
     * @param {String} key In key
     * @param {Array} array In array
     * @returns {number}
     */
    var existsInArray = function (keyValue, key, array) {
      var i;
      for (i = 0; i < array.length; i++) {
        if (array[i][key] === keyValue) {
          return i;
        }
      }
      return -1;
    };

    /**
     * Show a section
     * @param {Object} section
     */
    var showSection = function (section) {
      section.$element.addClass('h5p-question-visible');
      section.isVisible = true;
    };

    /**
     * Hide a section
     * @param {Object} section
     */
    var hideSection = function (section) {
      section.$element.css('max-height', '');
      section.isVisible = false;

      setTimeout(function () {
        // Only hide if section hasn't been set to visible in the meantime
        if (!section.isVisible) {
          section.$element.removeClass('h5p-question-visible');
        }
      }, 150);
    };

    /**
     * Set behaviour for question.
     *
     * @param {Object} options An object containing behaviour that will be extended by Question
     */
    self.setBehaviour = function (options) {
      $.extend(behaviour, options);
    };

    /**
     * A video to display above the task.
     *
     * @param {object} params
     */
    self.setVideo = function (params) {
      sections.video = {
        $element: $('<div/>', {
          'class': 'h5p-question-video'
        })
      };

      if (disableAutoPlay && params.params.playback) {
        params.params.playback.autoplay = false;
      }

      // Never fit to wrapper
      if (!params.params.visuals) {
        params.params.visuals = {};
      }
      params.params.visuals.fit = false;
      sections.video.instance = H5P.newRunnable(params, self.contentId, sections.video.$element, true);
      var fromVideo = false; // Hack to avoid never ending loop
      sections.video.instance.on('resize', function () {
        fromVideo = true;
        self.trigger('resize');
        fromVideo = false;
      });
      self.on('resize', function () {
        if (!fromVideo) {
          sections.video.instance.trigger('resize');
        }
      });

      return self;
    };

    /**
     * An audio player to display above the task.
     *
     * @param {object} params
     */
    self.setAudio = function (params) {
      params.params = params.params || {};

      sections.audio = {
        $element: $('<div/>', {
          'class': 'h5p-question-audio',
        })
      };

      if (disableAutoPlay) {
        params.params.autoplay = false;
      }
      else if (params.params.playerMode === 'transparent') {
        params.params.autoplay = true; // false doesn't make sense for transparent audio
      }

      sections.audio.instance = H5P.newRunnable(params, self.contentId, sections.audio.$element, true);
      // The height value that is set by H5P.Audio is counter-productive here.
      if (sections.audio.instance.audio) {
        sections.audio.instance.audio.style.height = '';
      }

      return self;
    };

    /**
     * Will stop any playback going on in the task.
     */
    self.pause = function () {
      if (sections.video && sections.video.isVisible) {
        sections.video.instance.pause();
      }
      if (sections.audio && sections.audio.isVisible) {
        sections.audio.instance.pause();
      }
    };

    /**
     * Start playback of video
     */
    self.play = function () {
      if (sections.video && sections.video.isVisible) {
        sections.video.instance.play();
      }
      if (sections.audio && sections.audio.isVisible) {
        sections.audio.instance.play();
      }
    };

    /**
     * Disable auto play, useful in editors.
     */
    self.disableAutoPlay = function () {
      disableAutoPlay = true;
    };

    /**
     * Process HTML escaped string for use as attribute value,
     * e.g. for alt text or title attributes.
     *
     * @param {string} value
     * @return {string} WARNING! Do NOT use for innerHTML.
     */
    self.massageAttributeOutput = function (value) {
      const dparser = new DOMParser().parseFromString(value, 'text/html');
      const div = document.createElement('div');
      div.innerHTML = dparser.documentElement.textContent;;
      return div.textContent || div.innerText || '';
    };

    /**
     * Add task image.
     *
     * @param {string} path Relative
     * @param {Object} [options] Options object
     * @param {string} [options.alt] Text representation
     * @param {string} [options.title] Hover text
     * @param {Boolean} [options.disableImageZooming] Set as true to disable image zooming
     * @param {string} [options.expandImage] Localization strings
     * @param {string} [options.minimizeImage] Localization string

     */
    self.setImage = function (path, options) {
      options = options ? options : {};
      sections.image = {};
      // Image container
      sections.image.$element = $('<div/>', {
        'class': 'h5p-question-image h5p-question-image-fill-width'
      });

      // Inner wrap
      var $imgWrap = $('<div/>', {
        'class': 'h5p-question-image-wrap',
        appendTo: sections.image.$element
      });

      // Image element
      var $img = $('<img/>', {
        src: H5P.getPath(path, self.contentId),
        alt: (options.alt === undefined ? '' : self.massageAttributeOutput(options.alt)),
        title: (options.title === undefined ? '' : self.massageAttributeOutput(options.title)),
        on: {
          load: function () {
            self.trigger('imageLoaded', this);
            self.trigger('resize');
          }
        },
        appendTo: $imgWrap
      });

      // Disable image zooming
      if (options.disableImageZooming) {
        $img.css('maxHeight', 'none');

        // Make sure we are using the correct amount of width at all times
        var determineImgWidth = function () {

          // Remove margins if natural image width is bigger than section width
          var imageSectionWidth = sections.image.$element.get(0).getBoundingClientRect().width;

          // Do not transition, for instant measurements
          $imgWrap.css({
            '-webkit-transition': 'none',
            'transition': 'none'
          });

          // Margin as translateX on both sides of image.
          var diffX = 2 * ($imgWrap.get(0).getBoundingClientRect().left -
            sections.image.$element.get(0).getBoundingClientRect().left);

          if ($img.get(0).naturalWidth >= imageSectionWidth - diffX) {
            sections.image.$element.addClass('h5p-question-image-fill-width');
          }
          else { // Use margin for small res images
            sections.image.$element.removeClass('h5p-question-image-fill-width');
          }

          // Reset transition rules
          $imgWrap.css({
            '-webkit-transition': '',
            'transition': ''
          });
        };

        // Determine image width
        if ($img.is(':visible')) {
          determineImgWidth();
        }
        else {
          $img.on('load', determineImgWidth);
        }

        // Skip adding zoom functionality
        return;
      }

      const setAriaLabel = () => {
        const ariaLabel = $imgWrap.attr('aria-expanded') === 'true'
          ? options.minimizeImage 
          : options.expandImage;
          
          $imgWrap.attr('aria-label', `${ariaLabel} ${options.alt}`);
        };

      var sizeDetermined = false;
      var determineSize = function () {
        if (sizeDetermined || !$img.is(':visible')) {
          return; // Try again next time.
        }

        $imgWrap.addClass('h5p-question-image-scalable')
          .attr('aria-expanded', false)
          .attr('role', 'button')
          .attr('tabIndex', '0')
          .on('click', function (event) {
            if (event.which === 1) {
              scaleImage.apply(this); // Left mouse button click
              setAriaLabel();
            }
          }).on('keypress', function (event) {
            if (event.which === 32) {
              event.preventDefault(); // Prevent default behaviour; page scroll down
              scaleImage.apply(this); // Space bar pressed
              setAriaLabel();
            }
          });

        setAriaLabel();

        sections.image.$element.removeClass('h5p-question-image-fill-width');

        sizeDetermined  = true; // Prevent any futher events
      };

      self.on('resize', determineSize);

      return self;
    };

    /**
     * Add the introduction section.
     *
     * @param {(string|H5P.jQuery)} content
     */
    self.setIntroduction = function (content) {
      register('introduction', content);

      return self;
    };

    /**
     * Add the content section.
     *
     * @param {(string|H5P.jQuery)} content
     * @param {Object} [options]
     * @param {string} [options.class]
     */
    self.setContent = function (content, options) {
      register('content', content);

      if (options && options.class) {
        sections.content.$element.addClass(options.class);
      }

      return self;
    };

    /**
     * Force readspeaker to read text. Useful when you have to use
     * setTimeout for animations.
     */
    self.read = function (content) {
      if (!$read) {
        return; // Not ready yet
      }

      if (readText) {
        // Combine texts if called multiple times
        readText += (readText.substr(-1, 1) === '.' ? ' ' : '. ') + content;
      }
      else {
        readText = content;
      }

      // Set text
      $read.html(readText);

      setTimeout(function () {
        // Stop combining when done reading
        readText = null;
        $read.html('');
      }, 100);
    };

    /**
     * Read feedback
     */
    self.readFeedback = function () {
      var invalidFeedback =
        behaviour.disableReadSpeaker ||
        !showFeedback ||
        !sections.feedback ||
        !sections.feedback.$element;

      if (invalidFeedback) {
        return;
      }

      var $feedbackText = $('.h5p-question-feedback-content-text', sections.feedback.$element);
      if ($feedbackText && $feedbackText.html() && $feedbackText.html().length) {
        self.read($feedbackText.html());
      }
    };

    /**
     * Remove feedback
     *
     * @return {H5P.QuestionCFRD}
     */
    self.removeFeedback = function () {

      clearTimeout(feedbackTransitionTimer);

      if (sections.feedback && showFeedback) {

        showFeedback = false;

        // Hide feedback & scorebar
        hideSection(sections.scorebar);
        hideSection(sections.feedback);

        sectionsIsTransitioning = true;

        // Detach after transition
        feedbackTransitionTimer = setTimeout(function () {
          // Avoiding Transition.onTransitionEnd since it will register multiple events, and there's no way to cancel it if the transition changes back to "show" while the animation is happening.
          if (!showFeedback) {
            sections.feedback.$element.children().detach();
            sections.scorebar.$element.children().detach();

            // Trigger resize after animation
            self.trigger('resize');
          }
          sectionsIsTransitioning = false;
          scoreBar.setScore(0);
        }, 150);

        if ($wrapper) {
          $wrapper.find('.h5p-question-feedback-tail').remove();
        }

        feedbackPopupDismissible = false;
        feedbackPopupOnClose = null;
        feedbackPopupPresentation = null;
      }

      return self;
    };

    /**
     * Show a previously hidden dismissible feedback popup.
     *
     * @return {H5P.QuestionCFRD}
     */
    self.showFeedbackPopup = function () {
      if (!sections.feedback || !sections.feedback.$element.hasClass('h5p-question-popup')) {
        return self;
      }

      var $element = sections.feedback.$element;
      var $parent = sections.content.$element;
      var $tail = $parent.find('.h5p-question-feedback-tail').first();

      if (sections.scorebar) {
        sections.scorebar.$element.appendTo($element);
        showSection(sections.scorebar);
      }

      showSection(sections.feedback);
      $element.addClass('h5p-question-popup-open');

      if (sections.buttons) {
        sections.buttons.$element.removeClass('has-scorebar');
      }

      setTimeout(function () {
        finalizeFeedbackPopupLayout($element);
        applyFeedbackPopupPresentation(feedbackPopupPresentation);
      }, 0);

      return self;
    };

    /**
     * Returns true if the feedback popup is currently visible.
     *
     * @return {boolean}
     */
    self.isFeedbackPopupVisible = function () {
      return !!(sections.feedback
        && sections.feedback.$element.hasClass('h5p-question-popup')
        && sections.feedback.$element.hasClass('h5p-question-visible'));
    };

    /**
     * Set feedback message.
     *
     * @param {string} [content]
     * @param {number} score The score
     * @param {number} maxScore The maximum score for this question
     * @param {string} [scoreBarLabel] Makes it easier for readspeakers to identify the scorebar
     * @param {string} [helpText] Help text that describes the score inside a tip icon
     * @param {object} [popupSettings] Extra settings for popup feedback
     * @param {boolean} [popupSettings.showAsPopup] Should the feedback display as popup?
     * @param {string} [popupSettings.closeText] Translation for close button text
     * @param {boolean} [popupSettings.alwaysShowClose] Always show close button (e.g. summary popup)
     * @param {boolean} [popupSettings.dismissible] Hide popup on close and allow reopening
     * @param {function} [popupSettings.onClose] Callback when dismissible popup is closed
     * @param {object} [popupSettings.click] Element representing where user clicked on screen
     */
    self.setFeedback = function (content, score, maxScore, scoreBarLabel, helpText, popupSettings, scoreExplanationButtonLabel) {
      // Feedback is disabled
      if (behaviour.disableFeedback) {
        return self;
      }

      var useFeedbackPopup = popupSettings != null && popupSettings.showAsPopup == true
        && content !== undefined && content.trim().length > 0;

      // Snapshot footer height before buttons are hidden (first check with popup).
      if (useFeedbackPopup && sections.buttons && sections.buttons.$element.length) {
        var $btnSectionBeforeHide = sections.buttons.$element;

        if (!$btnSectionBeforeHide.hasClass('h5p-question-buttons-all-hidden')) {
          var preHidePx = Math.ceil($btnSectionBeforeHide.outerHeight(true));

          if (preHidePx > 0) {
            buttonsPrePopupFooterReserve = pxToEm($btnSectionBeforeHide, preHidePx);
          }
        }
      }

      // Need to toggle buttons right away to avoid flickering/blinking
      // Note: This means content types should invoke hide/showButton before setFeedback
      toggleButtons();

      clickElement = (popupSettings != null && popupSettings.click != null ? popupSettings.click : null);
      clearTimeout(feedbackTransitionTimer);

      var $feedback = $('<div>', {
        'class': 'h5p-question-feedback-container'
      });

      var $feedbackContent = $('<div>', {
        'class': 'h5p-question-feedback-content'
      }).appendTo($feedback);

      // Feedback text
      $('<div>', {
        'class': 'h5p-question-feedback-content-text',
        'html': content
      }).appendTo($feedbackContent);

      var $scorebar = $('<div>', {
        'class': 'h5p-question-scorebar-container'
      });
      if (scoreBar === undefined) {
        scoreBar = JoubelUI.createScoreBar(maxScore, scoreBarLabel, helpText, scoreExplanationButtonLabel);
      }
      scoreBar.appendTo($scorebar);

      $feedbackContent.toggleClass('has-content', content !== undefined && content.length > 0);

      // Feedback for readspeakers
      if (!behaviour.disableReadSpeaker && scoreBarLabel) {
        var feedbackForRead = (popupSettings != null && popupSettings.plainText)
          ? popupSettings.plainText
          : (content ? content : '');
        self.read(scoreBarLabel.replace(':num', score).replace(':total', maxScore) + '. ' + feedbackForRead);
      }

      showFeedback = true;

      if (sections.feedback) {
        // Update section
        update('feedback', $feedback);
        update('scorebar', $scorebar);
      }
      else {
        // Create section
        register('feedback', $feedback);
        register('scorebar', $scorebar);
        if (initialized && $wrapper) {
          insert(self.order, 'feedback', sections, $wrapper);
          if (!useFeedbackPopup) {
            insert(self.order, 'scorebar', sections, $wrapper);
          }
        }
      }

      if (useFeedbackPopup) {
        feedbackPopupPresentation = {
          popupBackgroundColor: popupSettings.popupBackgroundColor
        };

        scoreBar.setScore(score);
        resizeButtons();
        makeFeedbackPopup(popupSettings);
        showSection(sections.feedback);

        if (sections.buttons) {
          sections.buttons.$element.removeClass('has-scorebar');
        }

        syncButtonsFooterReserveForFeedbackPopup(buttonsPrePopupFooterReserve);
        schedulePopupFooterReserveSync();

        feedbackTransitionTimer = setTimeout(function () {
          finalizeFeedbackPopupLayout(sections.feedback.$element);
        }, 0);
      }
      else {
        showSection(sections.feedback);
        showSection(sections.scorebar);

        resizeButtons();

        // Show feedback section
        feedbackTransitionTimer = setTimeout(function () {
          setElementHeight(sections.feedback.$element);
          setElementHeight(sections.scorebar.$element);
          sectionsIsTransitioning = true;

          // Scroll to bottom after showing feedback
          scrollToBottom();

          // Trigger resize after animation
          feedbackTransitionTimer = setTimeout(function () {
            sectionsIsTransitioning = false;
            self.trigger('resize');
            scoreBar.setScore(score);
          }, 150);
        }, 0);
      }

      return self;
    };

    /**
     * Set feedback content (no animation).
     *
     * @param {string} content
     * @param {boolean} [extendContent] True will extend content, instead of replacing it
     */
    self.updateFeedbackContent = function (content, extendContent) {
      if (sections.feedback && sections.feedback.$element) {

        if (extendContent) {
          content = $('.h5p-question-feedback-content', sections.feedback.$element).html() + ' ' + content;
        }

        // Update feedback content html
        $('.h5p-question-feedback-content', sections.feedback.$element).html(content).addClass('has-content');

        // Make sure the height is correct
        setElementHeight(sections.feedback.$element);

        // Need to trigger resize when feedback has finished transitioning
        setTimeout(self.trigger.bind(self, 'resize'), 150);
      }

      return self;
    };

    /**
     * Set the content of the explanation / feedback panel
     *
     * @param {Object} data
     * @param {string} data.correct
     * @param {string} data.wrong
     * @param {string} data.text
     * @param {string} title Title for explanation panel
     *
     * @return {H5P.QuestionCFRD}
     */
    self.setExplanation = function (data, title) {
      if (data) {
        var explainer = new H5P.QuestionCFRD.Explainer(title, data);

        if (sections.explanation) {
          // Update section
          update('explanation', explainer.getElement());
        }
        else {
          register('explanation', explainer.getElement());

          if (initialized && $wrapper) {
            insert(self.order, 'explanation', sections, $wrapper);
          }
        }
      }
      else if (sections.explanation) {
        // Hide explanation section
        sections.explanation.$element.children().detach();
      }

      return self;
    };

    /**
     * Checks to see if button is registered.
     *
     * @param {string} id
     * @returns {boolean}
     */
    self.hasButton = function (id) {
      return (buttons[id] !== undefined);
    };

    /**
     * @typedef {Object} ConfirmationDialog
     * @property {boolean} [enable] Must be true to show confirmation dialog
     * @property {Object} [instance] Instance that uses confirmation dialog
     * @property {jQuery} [$parentElement] Append to this element.
     * @property {Object} [l10n] Translatable fields
     * @property {string} [l10n.header] Header text
     * @property {string} [l10n.body] Body text
     * @property {string} [l10n.cancelLabel]
     * @property {string} [l10n.confirmLabel]
     */

    /**
     * Register buttons for the task.
     *
     * @param {string} id
     * @param {string} text label
     * @param {function} clicked
     * @param {boolean} [visible=true]
     * @param {Object} [options] Options for button
     * @param {Object} [extras] Extra options
     * @param {ConfirmationDialog} [extras.confirmationDialog] Confirmation dialog
     * @param {Object} [extras.contentData] Content data
     * @params {string} [extras.textIfSubmitting] Text to display if submitting
     */
    self.addButton = function (id, text, clicked, visible, options, extras) {
      if (buttons[id]) {
        return self; // Already registered
      }

      if (sections.buttons === undefined)  {
        // We have buttons, register wrapper
        register('buttons');
        if (initialized) {
          insert(self.order, 'buttons', sections, $wrapper);
        }
        applyActionButtonAppearanceToButtons();
      }

      extras = extras || {};
      extras.confirmationDialog = extras.confirmationDialog || {};
      options = options || {};

      var confirmationDialog =
        self.addConfirmationDialogToButton(extras.confirmationDialog, clicked);

      /**
       * Handle button clicks through both mouse and keyboard
       * @private
       */
      var handleButtonClick = function () {
        if (extras.confirmationDialog.enable && confirmationDialog) {
          // Show popups section if used
          if (!extras.confirmationDialog.$parentElement) {
            sections.popups.$element.removeClass('hidden');
          }
          confirmationDialog.show($e.position().top);
        }
        else {
          clicked();
        }
      };

      const isSubmitting = extras.contentData && extras.contentData.standalone
        && (extras.contentData.isScoringEnabled || extras.contentData.isReportingEnabled);

      if (isSubmitting && extras.textIfSubmitting) {
        text = extras.textIfSubmitting;
      }

      buttons[id] = {
        isTruncated: false,
        text: text,
        isVisible: false,
        ariaLabel: options['aria-label']
      };

      // The button might be <button> or <a>
      // (dependent on options.href set or not)
      var isAnchorTag = (options.href !== undefined);
      var $e = buttons[id].$element = JoubelUI.createButton($.extend({
        'class': 'h5p-question-' + id,
        html: text,
        on: {
          click: function (event) {
            handleButtonClick();
            if (isAnchorTag) {
              event.preventDefault();
            }
          }
        }
      }, options));
      buttonOrder.push(id);

      H5P.Tooltip($e.get(0), {tooltipSource: 'data-tooltip'});

      // The button might be <button> or <a>. If <a>, the space key is not
      // triggering the click event, must therefore handle this here:
      if (isAnchorTag) {
        $e.on('keypress', function (event) {
          if (event.which === 32) { // Space
            handleButtonClick();
            event.preventDefault();
          }
        });
      }

      // Always mount buttons so hiding never collapses the footer.
      $e.appendTo(sections.buttons.$element);

      if (visible === undefined || visible) {
        buttons[id].isVisible = true;
        showSection(sections.buttons);
      }
      else {
        hideButtonElement(id);
        buttons[id].isVisible = false;
        showSection(sections.buttons);
      }

      applyActionButtonAppearanceToButtons();

      return self;
    };

    /**
     * Set shared appearance for footer action buttons (check, retry, show feedback, etc.).
     *
     * @param {Object} appearance
     * @return {H5P.QuestionCFRD}
     */
    self.setActionButtonAppearance = function (appearance) {
      if (typeof H5P.QuestionCFRD.hasActionButtonAppearance !== 'function') {
        actionButtonAppearanceConfig = null;
        return self;
      }

      actionButtonAppearanceConfig = H5P.QuestionCFRD.hasActionButtonAppearance(appearance) ?
        appearance :
        null;
      applyActionButtonAppearanceToButtons();
      return self;
    };

    var setButtonWidth = function (button) {
      var $button = button.$element;
      var $tmp = $button.clone()
        .css({
          'position': 'absolute',
          'white-space': 'nowrap',
          'max-width': 'none'
        }).removeClass('truncated')
        .html(button.text)
        .appendTo($button.parent());

      // Calculate max width (button including text)
      button.width = {
        max: Math.ceil($tmp.outerWidth() + parseFloat($tmp.css('margin-left')) + parseFloat($tmp.css('margin-right')))
      };

      // Calculate min width (truncated, icon only)
      $tmp.html('').addClass('truncated');
      button.width.min = Math.ceil($tmp.outerWidth() + parseFloat($tmp.css('margin-left')) + parseFloat($tmp.css('margin-right')));
      $tmp.remove();
    };

    /**
     * Add confirmation dialog to button
     * @param {ConfirmationDialog} options
     *  A confirmation dialog that will be shown before click handler of button
     *  is triggered
     * @param {function} clicked
     *  Click handler of button
     * @return {H5P.ConfirmationDialog|undefined}
     *  Confirmation dialog if enabled
     */
    self.addConfirmationDialogToButton = function (options, clicked) {
      options = options || {};

      if (!options.enable) {
        return;
      }

      // Confirmation dialog
      var confirmationDialog = new H5P.ConfirmationDialog({
        instance: options.instance,
        headerText: options.l10n.header,
        dialogText: options.l10n.body,
        cancelText: options.l10n.cancelLabel,
        confirmText: options.l10n.confirmLabel
      });

      // Determine parent element
      if (options.$parentElement) {
        const parentElement = options.$parentElement.get(0);
        let dialogParent;
        // If using h5p-content, dialog will not appear on embedded fullscreen
        if (parentElement.classList.contains('h5p-content')) {
          dialogParent = parentElement.querySelector('.h5p-container');
        }

        confirmationDialog.appendTo(dialogParent ?? parentElement);
      }
      else {

        // Create popup section and append to that
        if (sections.popups === undefined) {
          register('popups');
          if (initialized) {
            insert(self.order, 'popups', sections, $wrapper);
          }
          sections.popups.$element.addClass('hidden');
          self.order.push('popups');
        }
        confirmationDialog.appendTo(sections.popups.$element.get(0));
      }

      // Add event listeners
      confirmationDialog.on('confirmed', function () {
        if (!options.$parentElement) {
          sections.popups.$element.addClass('hidden');
        }
        clicked();

        // Trigger to content type
        self.trigger('confirmed');
      });

      confirmationDialog.on('canceled', function () {
        if (!options.$parentElement) {
          sections.popups.$element.addClass('hidden');
        }
        // Trigger to content type
        self.trigger('canceled');
      });

      return confirmationDialog;
    };

    /**
     * Show registered button with given identifier.
     *
     * @param {string} id
     * @param {Number} [priority]
     */
    self.showButton = function (id, priority) {
      var aboutToBeHidden = existsInArray(id, 'id', buttonsToHide) !== -1;
      if (buttons[id] === undefined || (buttons[id].isVisible === true && !aboutToBeHidden)) {
        return self;
      }

      priority = priority || 0;

      // Skip if already being shown
      var indexToShow = existsInArray(id, 'id', buttonsToShow);
      if (indexToShow !== -1) {

        // Update priority
        if (buttonsToShow[indexToShow].priority < priority) {
          buttonsToShow[indexToShow].priority = priority;
        }

        return self;
      }

      // Check if button is going to be hidden on next tick
      var exists = existsInArray(id, 'id', buttonsToHide);
      if (exists !== -1) {

        // Skip hiding if higher priority
        if (buttonsToHide[exists].priority <= priority) {
          buttonsToHide.splice(exists, 1);
          buttonsToShow.push({id: id, priority: priority});
        }

      } // If button is not shown (use isVisible; :visible is wrong for DOM-hidden buttons)
      else if (!buttons[id].isVisible) {

        // Show button on next tick
        buttonsToShow.push({id: id, priority: priority});
      }

      if (!toggleButtonsTimer && buttonsToShow.length) {
        toggleButtonsTimer = setTimeout(toggleButtons, 0);
      }

      return self;
    };

    /**
     * Hide registered button with given identifier.
     *
     * @param {string} id
     * @param {number} [priority]
     */
    self.hideButton = function (id, priority) {
      var aboutToBeShown = existsInArray(id, 'id', buttonsToShow) !== -1;
      if (buttons[id] === undefined || (buttons[id].isVisible === false && !aboutToBeShown)) {
        return self;
      }

      priority = priority || 0;

      // Skip if already being hidden
      var indexToHide = existsInArray(id, 'id', buttonsToHide);
      if (indexToHide !== -1) {

        // Update priority
        if (buttonsToHide[indexToHide].priority < priority) {
          buttonsToHide[indexToHide].priority = priority;
        }

        return self;
      }

      // Check if buttons is going to be shown on next tick
      var exists = existsInArray(id, 'id', buttonsToShow);
      if (exists !== -1) {

        // Skip showing if higher priority
        if (buttonsToShow[exists].priority <= priority) {
          buttonsToShow.splice(exists, 1);
          buttonsToHide.push({id: id, priority: priority});
        }
      }
      else {

        // Hide button on next tick (buttons stay mounted; use isVisible, not :visible).
        buttonsToHide.push({id: id, priority: priority});
      }

      if (!toggleButtonsTimer && buttonsToHide.length) {
        toggleButtonsTimer = setTimeout(toggleButtons, 0);
      }

      return self;
    };

    /**
     * Set focus to the given button. If no button is given the first visible
     * button gets focused. This is useful if you lose focus.
     *
     * @param {string} [id]
     */
    self.focusButton = function (id) {
      if (id === undefined) {
        // Find first button that is visible.
        for (var i = 0; i < buttonOrder.length; i++) {
          var button = buttons[buttonOrder[i]];
          if (button && button.isVisible) {
            // Give that button focus
            button.$element.focus();
            break;
          }
        }
      }
      else if (buttons[id] && buttons[id].$element.is(':visible')) {
        // Set focus to requested button
        buttons[id].$element.focus();
      }

      return self;
    };

    /**
     * Toggle readspeaker functionality
     * @param {boolean} [disable] True to disable, false to enable.
     */
    self.toggleReadSpeaker = function (disable) {
      behaviour.disableReadSpeaker = disable || !behaviour.disableReadSpeaker;
    };

    /**
     * Set new element for section.
     *
     * @param {String} id
     * @param {H5P.jQuery} $element
     */
    self.insertSectionAtElement = function (id, $element) {
      if (sections[id] === undefined) {
        register(id);
      }
      sections[id].parent = $element;

      // Insert section if question is not initialized
      if (!initialized) {
        insert([id], id, sections, $element);
      }

      return self;
    };

    /**
     * Attach content to given container.
     *
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      if (self.isRoot()) {
        self.setActivityStarted();
      }

      // The first time we attach we also create our DOM elements.
      if ($wrapper === undefined) {
        if (self.registerDomElements !== undefined &&
           (self.registerDomElements instanceof Function ||
           typeof self.registerDomElements === 'function')) {

          // Give the question type a chance to register before attaching
          self.registerDomElements();
        }

        // Create section for reading messages
        $read = $('<div/>', {
          'aria-live': 'polite',
          'class': 'h5p-hidden-read'
        });
        register('read', $read);
        self.trigger('registerDomElements');
      }

      // Prepare container
      $wrapper = $container;
      $container.html('')
        .addClass('h5p-question h5p-' + type);

      // Add sections in given order
      var $sections = [];
      for (var i = 0; i < self.order.length; i++) {
        var section = self.order[i];
        if (sections[section]) {
          if (sections[section].parent) {
            // Section has a different parent
            sections[section].$element.appendTo(sections[section].parent);
          }
          else {
            $sections.push(sections[section].$element);
          }
          sections[section].isVisible = true;
        }
      }

      // Only append once to DOM for optimal performance
      $container.append($sections);

      // Let others react to dom changes
      self.trigger('domChanged', {
        '$target': $container,
        'library': self.libraryInfo.machineName,
        'contentId': self.contentId,
        'key': 'newLibrary'
      }, {'bubbles': true, 'external': true});

      // ??
      initialized = true;

      return self;
    };

    /**
     * Detach all sections from their parents
     */
    self.detachSections = function () {
      // Deinit Question
      initialized = false;

      // Detach sections
      for (var section in sections) {
        sections[section].$element.detach();
      }

      return self;
    };

    // Listen for resize
    self.on('resize', function () {
      // Allow elements to attach and set their height before resizing
      if (!sectionsIsTransitioning && sections.feedback && showFeedback) {
        if (sections.feedback.$element.hasClass('h5p-question-popup')) {
          sections.feedback.$element.css('max-height', 'none');
        }
        else {
          setElementHeight(sections.feedback.$element);
        }
      }

      // Re-position feedback popup if in use
      var $element = sections.feedback;
      var $click = clickElement;

      if ($element != null && $element.$element != null
          && $element.$element.hasClass('h5p-question-popup')
          && $element.$element.hasClass('h5p-question-visible')) {
        setTimeout(function () {
          whenFeedbackImagesReady($element.$element, function () {
            positionFeedbackPopup(
              $element.$element,
              $click != null ? $click.$element : null
            );
          });
        }, 10);
      }
      else if ($element != null && $element.$element != null && $click != null && $click.$element != null) {
        setTimeout(function () {
          positionFeedbackPopup($element.$element, $click.$element);
        }, 10);
      }

      resizeButtons();
    });
  }

  // Inheritance
  Question.prototype = Object.create(EventDispatcher.prototype);
  Question.prototype.constructor = Question;

  /**
   * Normalize overall feedback configuration from content parameters.
   *
   * @param {Object|Array} overallFeedbackOption
   * @return {{popupBackgroundColor: string, feedbackTextColor: string, ranges: Array}}
   */
  Question.normalizeOverallFeedbackConfig = function (overallFeedbackOption) {
    var config = {
      popupBackgroundColor: '#ffffff',
      feedbackTextColor: '#333333',
      ranges: []
    };

    if (!overallFeedbackOption) {
      return config;
    }

    if (Array.isArray(overallFeedbackOption)) {
      config.ranges = overallFeedbackOption;
      return config;
    }

    if (overallFeedbackOption.popupBackgroundColor) {
      config.popupBackgroundColor = overallFeedbackOption.popupBackgroundColor;
    }

    if (overallFeedbackOption.feedbackTextColor) {
      config.feedbackTextColor = overallFeedbackOption.feedbackTextColor;
    }

    if (Array.isArray(overallFeedbackOption.overallFeedback)) {
      config.ranges = overallFeedbackOption.overallFeedback;
    }

    return config;
  };

  /**
   * Escape HTML for safe text output.
   *
   * @private
   * @param {string} text
   * @return {string}
   */
  var escapeOverallFeedbackHtml = function (text) {
    return $('<div>').text(text).html();
  };

  /**
   * Read appearance settings from a range entry (nested or legacy flat structure).
   *
   * @param {Object} entry
   * @return {Object}
   */
  Question.getOverallFeedbackAppearance = function (entry) {
    entry = entry || {};
    var appearance = entry.appearance || {};

    return {
      feedbackLeadText: appearance.feedbackLeadText !== undefined
        ? appearance.feedbackLeadText
        : entry.feedbackLeadText,
      feedbackLeadBold: appearance.feedbackLeadBold !== undefined
        ? appearance.feedbackLeadBold
        : entry.feedbackLeadBold,
      feedbackLeadTextColor: appearance.feedbackLeadTextColor
        || appearance.feedbackTextColor
        || entry.feedbackLeadTextColor
        || entry.feedbackTextColor
        || '#1a73d9',
      feedbackTextAlign: appearance.feedbackTextAlign || entry.feedbackTextAlign || 'left',
      feedbackImage: appearance.feedbackImage || entry.feedbackImage,
      feedbackImagePosition: appearance.feedbackImagePosition || entry.feedbackImagePosition || 'left'
    };
  };

  /**
   * Build overall feedback markup for a matching range entry.
   *
   * @param {Object} entry
   * @param {string} popupBackgroundColor
   * @param {string} feedbackTextColor
   * @param {number} contentId
   * @param {number|string} score
   * @param {number|string} maxScore
   * @return {{html: string, plainText: string, popupBackgroundColor: string}|null}
   */
  Question.buildOverallFeedbackMarkup = function (entry, popupBackgroundColor, feedbackTextColor, contentId, score, maxScore) {
    var appearance = Question.getOverallFeedbackAppearance(entry);
    var lead = (appearance.feedbackLeadText && appearance.feedbackLeadText.trim()) || '';
    var body = (entry.feedback && entry.feedback.trim()) || '';

    if (!lead && !body) {
      return null;
    }

    var replacePlaceholders = function (text) {
      return escapeOverallFeedbackHtml(String(text))
        .replace(/@score/g, score)
        .replace(/@total/g, maxScore);
    };

    var bodyTextColor = feedbackTextColor || '#333333';
    var leadTextColor = appearance.feedbackLeadTextColor;
    var imagePosition = appearance.feedbackImagePosition || 'left';
    var leadBold = appearance.feedbackLeadBold !== false;
    var hasImage = appearance.feedbackImage && appearance.feedbackImage.path && contentId !== undefined;
    var textAlign = hasImage
      ? (imagePosition === 'above' ? 'center' : 'left')
      : (appearance.feedbackTextAlign || 'left');
    var outerClasses = 'h5p-overall-feedback';

    if (hasImage) {
      outerClasses += ' h5p-overall-feedback--image-' + imagePosition;
    }
    else {
      outerClasses += ' h5p-overall-feedback--no-image';
    }

    var html = '<div class="' + outerClasses + '">';
    html += '<div class="h5p-overall-feedback__content" style="color:' + escapeOverallFeedbackHtml(bodyTextColor) + '">';

    if (hasImage) {
      var imgPath = H5P.getPath(appearance.feedbackImage.path, contentId);
      var altText = lead ? lead.replace(/@score/g, score).replace(/@total/g, maxScore) : '';
      html += '<img class="h5p-overall-feedback__image" src="' + escapeOverallFeedbackHtml(imgPath) + '" alt="' + escapeOverallFeedbackHtml(altText) + '"/>';
    }

    html += '<div class="h5p-overall-feedback__text h5p-overall-feedback__text--align-' + textAlign + '">';

    if (lead) {
      var leadHtml = replacePlaceholders(lead);
      var leadStyle = leadTextColor
        ? ' style="color:' + escapeOverallFeedbackHtml(leadTextColor) + '"'
        : '';
      html += leadBold
        ? '<strong class="h5p-overall-feedback__lead"' + leadStyle + '>' + leadHtml + '</strong>'
        : '<span class="h5p-overall-feedback__lead"' + leadStyle + '>' + leadHtml + '</span>';
    }

    if (body) {
      if (lead) {
        html += ' ';
      }
      html += '<span class="h5p-overall-feedback__body">' + replacePlaceholders(body) + '</span>';
    }

    html += '</div></div></div>';

    var plainText = ((lead ? lead + ' ' : '') + body)
      .replace(/@score/g, score)
      .replace(/@total/g, maxScore);

    return {
      html: html,
      plainText: plainText,
      popupBackgroundColor: popupBackgroundColor || '#ffffff'
    };
  };

  /**
   * Resolve overall feedback markup and presentation for the current score.
   *
   * @param {Object|Array} overallFeedbackOption
   * @param {number} scoreRatio
   * @param {number} contentId
   * @param {number|string} score
   * @param {number|string} maxScore
   * @return {{html: string, plainText: string, popupBackgroundColor: string}|null}
   */
  Question.resolveOverallFeedback = function (overallFeedbackOption, scoreRatio, contentId, score, maxScore) {
    var config = Question.normalizeOverallFeedbackConfig(overallFeedbackOption);
    var scorePercent = Math.floor(scoreRatio * 100);
    var i;

    for (i = 0; i < config.ranges.length; i++) {
      var entry = config.ranges[i];
      var appearance = Question.getOverallFeedbackAppearance(entry);
      var lead = (appearance.feedbackLeadText && appearance.feedbackLeadText.trim()) || '';
      var body = (entry.feedback && entry.feedback.trim()) || '';
      var hasFeedback = lead.length > 0 || body.length > 0;

      if (entry.from <= scorePercent && entry.to >= scorePercent && hasFeedback) {
        return Question.buildOverallFeedbackMarkup(
          entry,
          config.popupBackgroundColor,
          config.feedbackTextColor,
          contentId,
          score,
          maxScore
        );
      }
    }

    return null;
  };

  /**
   * Determine the overall feedback to display for the question.
   * Returns empty string if no matching range is found.
   *
   * @param {Object|Array} feedbacks
   * @param {number} scoreRatio
   * @return {string}
   */
  Question.determineOverallFeedback = function (feedbacks, scoreRatio) {
    var config = Question.normalizeOverallFeedbackConfig(feedbacks);
    scoreRatio = Math.floor(scoreRatio * 100);

    for (var i = 0; i < config.ranges.length; i++) {
      var feedback = config.ranges[i];
      var appearance = Question.getOverallFeedbackAppearance(feedback);
      var lead = (appearance.feedbackLeadText && appearance.feedbackLeadText.trim()) || '';
      var body = (feedback.feedback !== undefined && feedback.feedback.trim().length !== 0)
        ? feedback.feedback.trim()
        : '';
      var hasFeedback = lead.length > 0 || body.length > 0;

      if (feedback.from <= scoreRatio && feedback.to >= scoreRatio && hasFeedback) {
        return body || lead;
      }
    }

    return '';
  };

  return Question;
})(H5P.jQuery, H5P.EventDispatcher, H5P.JoubelUICFRD);
